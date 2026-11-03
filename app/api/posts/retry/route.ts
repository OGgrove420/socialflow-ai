// POST /api/posts/retry?id=... — retry failed/needs_reauth targets of a post.
// refuses when the target already carries a remote_id (it published remotely;
// a retry would duplicate). reuses the original idempotency key so a retry
// after a timeout cannot double-post.
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { selectRows, updateRows } from "@/lib/db";
import { publishTarget, rollupPostStatus, writeAudit } from "@/lib/publish";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });
  const token = sessionToken(req);
  const postId = new URL(req.url).searchParams.get("id");
  if (!postId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const posts = await selectRows("posts", { token, filters: { id: postId, owner: session.userId } });
  if (!posts[0]) return NextResponse.json({ error: "post not found" }, { status: 404 });

  const targets = await selectRows("post_targets", { token, filters: { post_id: postId } });
  const retryable = (targets as Record<string, unknown>[]).filter(
    (t) => ["failed", "needs_reauth"].includes(String(t.status)) && !t.remote_id,
  );
  const alreadyDone = (targets as Record<string, unknown>[]).filter(
    (t) => t.remote_id && ["failed", "needs_reauth"].includes(String(t.status)),
  );

  // targets that hold a remote_id but show failed/needs_reauth are inconsistent;
  // mark them published so they cannot double-post on a later retry
  for (const t of alreadyDone) {
    await updateRows("post_targets", token, { id: String(t.id) }, { status: "published" });
  }

  const results = [];
  for (const t of retryable) {
    try {
      results.push(await publishTarget({ targetId: String(t.id), userToken: token }));
    } catch (err) {
      results.push({
        targetId: String(t.id), platform: String(t.platform),
        status: "failed", error: (err as Error).message,
      });
    }
  }

  const postStatus = await rollupPostStatus(postId, token);
  await writeAudit(token, false, session.userId, "post_retry", {
    postId, retried: retryable.length,
  });

  return NextResponse.json({
    ok: true,
    postStatus,
    retried: retryable.length,
    reconciled: alreadyDone.length,
    results,
  });
}

function sessionToken(req: Request): string {
  return req.headers.get("cookie")?.match(/sf_session=([^;]+)/)?.[1] ?? "";
}
