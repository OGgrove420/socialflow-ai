// GET /api/accounts — the user's connected accounts, no token material ever.
// DELETE /api/accounts?id=... — disconnect (sets status disconnected, audit).
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { selectRows, insertRow, updateRows } from "@/lib/db";
import { allAdapters, getAdapter } from "@/lib/platforms";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });

  const token = sessionToken(req);
  const accounts = await selectRows("social_accounts", {
    token,
    filters: { owner: session.userId },
    order: "created_at.desc",
  });

  const capabilities: Record<string, unknown> = {};
  for (const adapter of allAdapters()) {
    capabilities[adapter.id] = {
      name: adapter.name,
      capabilities: adapter.capabilities,
      reviewRequired: adapter.reviewRequired,
      reviewNote: adapter.reviewNote ?? null,
      fallbackNote: adapter.fallbackNote,
      credentialsConfigured: adapter.credentialsConfigured(),
      authType: adapter.authType,
    };
  }

  const safe = (accounts as Record<string, unknown>[]).map((a) => ({
    id: a.id,
    platform: a.platform,
    platformUserId: a.platform_user_id,
    accountName: a.account_name,
    avatarUrl: a.avatar_url,
    scopes: a.scopes,
    status: a.status,
    tokenExpiresAt: a.token_expires_at,
    meta: a.meta,
    lastPublishAt: a.last_publish_at,
    createdAt: a.created_at,
    // status derivation: token expiry in the past -> expired; <7d -> warn
    expiresSoon:
      typeof a.token_expires_at === "string"
        ? new Date(a.token_expires_at).getTime() - Date.now() < 7 * 24 * 3600 * 1000
        : false,
  }));

  return NextResponse.json({ accounts: safe, platforms: capabilities });
}

export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "login required" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const token = sessionToken(req);
  const rows = await selectRows("social_accounts", {
    token,
    filters: { id, owner: session.userId },
    limit: 1,
  });
  const account = rows[0] as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

  await updateRows("social_accounts", token, { id }, {
    status: "disconnected",
    access_token_enc: await encryptEmpty(),
    refresh_token_enc: null,
    token_expires_at: null,
  });
  await insertRow("audit_log", token, {
    owner: session.userId,
    action: "disconnect",
    detail: { platform: account.platform, platformUserId: account.platform_user_id },
  });
  return NextResponse.json({ ok: true });
}

async function encryptEmpty() {
  // overwrite the encrypted material on disconnect so no stale tokens remain
  const { encrypt } = await import("@/lib/crypto");
  return encrypt("");
}

function sessionToken(req: Request): string {
  return req.headers.get("cookie")?.match(/sf_session=([^;]+)/)?.[1] ?? "";
}
