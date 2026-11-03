// POST /api/cron/kick — scheduler tick triggered by any logged-in dashboard
// load (vercel hobby only allows daily cron, so user visits keep the queue
// near-real-time). runs the exact same claim/publish/backoff loop as the
// cron route, but scoped to the caller's own jobs via rls.
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { selectRows, updateRows } from "@/lib/db";
import { publishTarget, rollupPostStatus, backoffDelayMs } from "@/lib/publish";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });
  const token = sessionToken(req);

  // due jobs owned by this user (rls handles scoping through target->post)
  const jobs = await selectRows("publish_jobs", {
    token,
    filters: { status: "queued" },
    order: "run_at.asc",
    limit: 10,
  });
  const now = Date.now();
  const due = (jobs as Record<string, unknown>[]).filter(
    (j) => new Date(String(j.run_at)).getTime() <= now,
  );

  const processed: { jobId: string; outcome: string; retryAt?: string }[] = [];

  for (const job of due) {
    const jobId = String(job.id);
    const targetId = String(job.target_id);
    const attempts = Number(job.attempts ?? 0) + 1;

    try {
      const outcome = await publishTarget({ targetId, userToken: token });
      if (outcome.status === "published") {
        await updateRows("publish_jobs", token, { id: jobId }, { status: "done", attempts });
      } else if (outcome.status === "needs_reauth" || attempts >= 5) {
        await updateRows("publish_jobs", token, { id: jobId }, {
          status: "failed",
          attempts,
          last_error: outcome.error ?? outcome.status,
        });
      } else {
        const retryAt = new Date(now + backoffDelayMs(attempts)).toISOString();
        await updateRows("publish_jobs", token, { id: jobId }, {
          status: "queued",
          attempts,
          next_retry_at: retryAt,
          last_error: outcome.error ?? outcome.status,
        });
        processed.push({ jobId, outcome: outcome.status, retryAt });
        continue;
      }
      processed.push({ jobId, outcome: outcome.status });
    } catch (err) {
      const msg = (err as Error).message;
      await updateRows("publish_jobs", token, { id: jobId }, {
        status: attempts >= 5 ? "failed" : "queued",
        attempts,
        last_error: msg,
        ...(attempts < 5 ? { next_retry_at: new Date(now + backoffDelayMs(attempts)).toISOString() } : {}),
      });
      processed.push({ jobId, outcome: "error" });
    }

    try {
      const targets = await selectRows("post_targets", { token, filters: { id: targetId } });
      const postId = targets[0]?.post_id;
      if (postId) await rollupPostStatus(String(postId), token);
    } catch {
      // rollup must not abort the batch
    }
  }

  return NextResponse.json({ ok: true, due: due.length, processed });
}

function sessionToken(req: Request): string {
  return req.headers.get("cookie")?.match(/sf_session=([^;]+)/)?.[1] ?? "";
}
