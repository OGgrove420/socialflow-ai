// POST /api/posts — create + (publish now | schedule). GET — list.
// body: { body, targets: [{accountId, caption?}], mediaUrls?, scheduleAt? }
import { NextResponse } from "next/server";
import { webcrypto } from "node:crypto";
import { getSessionFromRequest } from "@/lib/session";
import { selectRows, insertRow, insertRows, deleteRows } from "@/lib/db";
import { getAdapter } from "@/lib/platforms";
import { publishTarget, rollupPostStatus, writeAudit, queueJobForTarget, type TargetOutcome } from "@/lib/publish";

type TargetInput = { accountId: string; caption?: string };

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });
  const token = sessionToken(req);

  let body: {
    body?: unknown; targets?: unknown; mediaUrls?: unknown; scheduleAt?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json body required" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const targets = Array.isArray(body.targets) ? (body.targets as TargetInput[]) : [];
  const mediaUrls = Array.isArray(body.mediaUrls)
    ? (body.mediaUrls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const scheduleAt = typeof body.scheduleAt === "string" && body.scheduleAt ? body.scheduleAt : null;

  if (!text && mediaUrls.length === 0) {
    return NextResponse.json({ error: "nothing to publish: add text or media" }, { status: 422 });
  }
  if (targets.length === 0) {
    return NextResponse.json({ error: "pick at least one account" }, { status: 422 });
  }

  // load + validate the accounts (all must be owned, connected, platform-usable)
  const accounts = await selectRows("social_accounts", {
    token,
    filters: { owner: session.userId },
  });
  const byId = new Map(
    (accounts as Record<string, unknown>[]).map((a) => [String(a.id), a]),
  );

  const validationErrors: {
    accountId: string; platform: string; problem: string; fallbackNote?: string;
  }[] = [];

  for (const t of targets) {
    const account = byId.get(t.accountId);
    if (!account) {
      validationErrors.push({ accountId: t.accountId, platform: "?", problem: "account not found or not yours" });
      continue;
    }
    const status = String(account.status);
    if (status !== "connected") {
      validationErrors.push({
        accountId: t.accountId,
        platform: String(account.platform),
        problem: `account status is ${status}; reconnect it first`,
      });
      continue;
    }
    const adapter = getAdapter(String(account.platform));
    if (!adapter) {
      validationErrors.push({
        accountId: t.accountId, platform: String(account.platform),
        problem: "platform adapter missing",
      });
      continue;
    }
    const caption = t.caption ?? text;
    if (caption.length > adapter.capabilities.maxCaption) {
      validationErrors.push({
        accountId: t.accountId,
        platform: String(account.platform),
        problem: `caption is ${caption.length} chars; ${adapter.name} allows ${adapter.capabilities.maxCaption}`,
        fallbackNote: adapter.fallbackNote,
      });
    }
    // media support check
    const hasImage = mediaUrls.some((u) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u));
    const hasVideo = mediaUrls.some((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u));
    if (hasImage && !adapter.capabilities.image && !adapter.capabilities.video) {
      validationErrors.push({
        accountId: t.accountId, platform: String(account.platform),
        problem: `${adapter.name} does not support image publishing`,
        fallbackNote: adapter.fallbackNote,
      });
    }
    if (hasVideo && !adapter.capabilities.video) {
      validationErrors.push({
        accountId: t.accountId, platform: String(account.platform),
        problem: `${adapter.name} does not support video publishing`,
        fallbackNote: adapter.fallbackNote,
      });
    }
    if (!hasImage && !hasVideo && !adapter.capabilities.text) {
      validationErrors.push({
        accountId: t.accountId, platform: String(account.platform),
        problem: `${adapter.name} is media-only (no text posts)`,
        fallbackNote: adapter.fallbackNote,
      });
    }
    if (scheduleAt && !adapter.capabilities.schedule) {
      validationErrors.push({
        accountId: t.accountId, platform: String(account.platform),
        problem: `${adapter.name} has no scheduled publishing via api`,
        fallbackNote: adapter.fallbackNote,
      });
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "some targets cannot take this post", problems: validationErrors },
      { status: 422 },
    );
  }

  const nowIso = new Date().toISOString();
  const isScheduled = Boolean(scheduleAt);

  // create the post
  const post = await insertRow("posts", token, {
    owner: session.userId,
    body: text,
    media_urls: mediaUrls,
    status: isScheduled ? "scheduled" : "publishing",
    scheduled_at: scheduleAt,
  });
  const postId = String(post.id);

  // create the targets with idempotency keys
  const targetRows = await insertRows(
    "post_targets",
    token,
    targets.map((t) => ({
      post_id: postId,
      account_id: t.accountId,
      platform: String(byId.get(t.accountId)?.platform ?? ""),
      caption: t.caption ?? text,
      status: "pending",
      attempts: 0,
      idempotency_key: webcrypto.randomUUID(),
    })),
  );

  await writeAudit(token, false, session.userId, "post_created", {
    postId,
    scheduled: isScheduled,
    targets: targetRows.length,
  });

  if (isScheduled) {
    for (const t of targetRows) {
      await queueJobForTarget(token, String(t.id), scheduleAt!);
    }
    return NextResponse.json({
      ok: true,
      postId,
      scheduled: true,
      scheduleAt,
      targets: targetRows.map((t) => ({ targetId: t.id, platform: t.platform, status: t.status })),
    }, { status: 201 });
  }

  // immediate: publish each target sequentially
  const results: TargetOutcome[] = [];
  for (const t of targetRows) {
    try {
      results.push(await publishTarget({ targetId: String(t.id), userToken: token }));
    } catch (err) {
      results.push({
        targetId: String(t.id),
        accountId: "?",
        platform: "?",
        status: "failed",
        error: (err as Error).message,
      });
    }
  }
  const postStatus = await rollupPostStatus(postId, token);

  return NextResponse.json({
    ok: results.some((r) => r.status === "published"),
    postId,
    postStatus,
    results,
  }, { status: 201 });
}

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });
  const token = sessionToken(req);
  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");

  if (postId) {
    const posts = await selectRows("posts", { token, filters: { id: postId, owner: session.userId } });
    if (!posts[0]) return NextResponse.json({ error: "post not found" }, { status: 404 });
    const targets = await selectRows("post_targets", { token, filters: { post_id: postId } });
    const jobs = await selectRows("publish_jobs", { token, filters: { target_id: String(targets[0]?.id ?? "none") } });
    return NextResponse.json({ post: posts[0], targets, jobs });
  }

  const posts = await selectRows("posts", {
    token, filters: { owner: session.userId }, order: "created_at.desc", limit: 50,
  });
  return NextResponse.json({ posts });
}

export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });
  const postId = new URL(req.url).searchParams.get("id");
  if (!postId) return NextResponse.json({ error: "id required" }, { status: 400 });
  const token = sessionToken(req);

  const posts = await selectRows("posts", { token, filters: { id: postId, owner: session.userId } });
  const post = posts[0] as Record<string, unknown> | undefined;
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
  if (!["draft", "scheduled"].includes(String(post.status))) {
    return NextResponse.json({ error: "only draft or scheduled posts can be canceled" }, { status: 409 });
  }

  // cancel queued jobs
  const targets = await selectRows("post_targets", { token, filters: { post_id: postId } });
  for (const t of targets as Record<string, unknown>[]) {
    await deleteRows("publish_jobs", token, { target_id: String(t.id), status: "queued" });
  }
  const { updateRows } = await import("@/lib/db");
  await updateRows("posts", token, { id: postId }, { status: "canceled" });
  await writeAudit(token, false, session.userId, "post_canceled", { postId });
  return NextResponse.json({ ok: true });
}

function sessionToken(req: Request): string {
  return req.headers.get("cookie")?.match(/sf_session=([^;]+)/)?.[1] ?? "";
}
