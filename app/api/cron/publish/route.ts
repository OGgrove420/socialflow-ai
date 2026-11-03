// GET /api/cron/publish — the scheduler tick (vercel cron hits this every minute).
// protected by CRON_SECRET (Authorization: Bearer <secret>), runs as the
// service role: claims due jobs atomically, publishes, schedules retries with
// exponential backoff, rolls up post statuses.
import { NextResponse } from "next/server";
import { claimDueJobs, serviceUpdate, serviceSelect, serviceInsert } from "@/lib/db";
import { publishTarget, rollupPostStatus, backoffDelayMs } from "@/lib/publish";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set; cron disabled" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const querySecret = url.searchParams.get("secret") ?? "";
  const provided = bearer || querySecret;
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await claimDueJobs(10);
  const processed: {
    jobId: string; targetId: string; outcome: string; retryAt?: string; error?: string | null;
  }[] = [];

  for (const job of jobs) {
    const jobId = String(job.id);
    const targetId = String(job.target_id);
    const attempts = Number(job.attempts ?? 0) + 1;

    try {
      const outcome = await publishTarget({ targetId, serviceRole: true });

      if (outcome.status === "published") {
        await serviceUpdate("publish_jobs", { id: jobId }, { status: "done", attempts });
      } else if (outcome.status === "needs_reauth" || attempts >= 5) {
        // no more retries for auth problems; others exhaust backoff after 5
        await serviceUpdate("publish_jobs", { id: jobId }, {
          status: "failed",
          attempts,
          last_error: outcome.error ?? outcome.status,
        });
      } else {
        const retryAt = new Date(Date.now() + backoffDelayMs(attempts)).toISOString();
        await serviceUpdate("publish_jobs", { id: jobId }, {
          status: "queued",
          attempts,
          next_retry_at: retryAt,
          last_error: outcome.error ?? outcome.status,
        });
        processed.push({ jobId, targetId, outcome: outcome.status, retryAt, error: outcome.error ?? null });
        continue;
      }
      processed.push({ jobId, targetId, outcome: outcome.status, error: outcome.error ?? null });
    } catch (err) {
      const msg = (err as Error).message;
      await serviceUpdate("publish_jobs", { id: jobId }, {
        status: attempts >= 5 ? "failed" : "queued",
        attempts,
        last_error: msg,
        ...(attempts < 5 ? { next_retry_at: new Date(Date.now() + backoffDelayMs(attempts)).toISOString() } : {}),
      });
      processed.push({ jobId, targetId, outcome: "error", error: msg });
    }

    // roll up the owning post
    try {
      const targets = await serviceSelect("post_targets", { id: targetId });
      const postId = targets[0]?.post_id;
      if (postId) await rollupPostStatus(String(postId), undefined, true);
    } catch {
      // rollup failure must not abort the batch
    }
  }

  // failed-post audit entries
  const failures = processed.filter((p) => p.outcome === "failed" || p.outcome === "error");
  for (const f of failures) {
    await serviceInsert("audit_log", {
      owner: null,
      action: "publish_failed",
      detail: f,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, claimed: jobs.length, processed });
}
