// GET /api/oauth/[platform]/callback
// validates state against cookie AND db row (single-use), exchanges the code,
// encrypts tokens, upserts the account, writes the audit entry, redirects.
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAdapter } from "@/lib/platforms";
import { consumeOauthState, insertRow, upsertSocialAccount } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

function htmlPage(title: string, message: string, status: number) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta http-equiv="refresh" content="4;url=/accounts">` +
    `<link rel="stylesheet" href="/globals.css"></head>` +
    `<body style="font-family:system-ui;background:#0a0a0f;color:#eaeaf0;` +
    `display:grid;place-items:center;min-height:100vh;margin:0">` +
    `<div style="max-width:480px;padding:24px"><h1 style="font-size:20px">${title}</h1>` +
    `<p style="opacity:.7;line-height:1.6">${message}</p>` +
    `<p style="opacity:.5;font-size:13px">returning to accounts…</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const adapter = getAdapter(platform);
  if (!adapter) return htmlPage("unknown platform", `no adapter for ${platform}.`, 404);

  if (oauthError) {
    return htmlPage(
      `${adapter.name} authorisation cancelled`,
      `the platform reported: ${decodeURIComponent(oauthError)}. you can try connecting again from the accounts page.`,
      200,
    );
  }
  if (!code || !state) {
    return htmlPage("missing parameters", "the platform callback had no code or state. start the connection again.", 400);
  }

  const session = await getSessionFromRequest(req);
  if (!session) return htmlPage("login required", "your session expired during authorisation. log in and connect again.", 401);

  // csrf: cookie must match query param, and the db row must exist (single-use)
  const cookieState = req.headers.get("cookie")?.match(/sf_oauth_state=([^;]+)/)?.[1] ?? null;
  if (!cookieState || cookieState !== state) {
    return htmlPage("state mismatch", "oauth state did not match the session cookie (possible csrf). connection refused.", 400);
  }
  let stateRow: { verifier: string | null; redirectTo: string | null } | null = null;
  try {
    stateRow = await consumeOauthState(state, sessionToken(req));
  } catch (err) {
    return htmlPage("state lookup failed", `could not verify the connection request: ${(err as Error).message}`, 500);
  }
  if (!stateRow) {
    return htmlPage("state not found or already used", "this authorisation request expired or was already completed. start the connection again.", 400);
  }

  // exchange the code
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const redirectUri = `${proto}://${host}/api/oauth/${platform}/callback`;

  let exchanged;
  try {
    exchanged = await adapter.exchangeCode(code, redirectUri, stateRow.verifier ?? undefined);
  } catch (err) {
    const e = err as Error & { status?: number; stage?: string };
    return htmlPage(
      `${adapter.name} token exchange failed`,
      `${e.message}${e.stage ? ` (stage: ${e.stage})` : ""}. check the platform configuration and try again.`,
      200,
    );
  }

  // encrypt + upsert
  try {
    const accessTokenEnc = await encrypt(exchanged.accessToken);
    const refreshTokenEnc = exchanged.refreshToken ? await encrypt(exchanged.refreshToken) : null;
    const expiresAt = exchanged.expiresIn
      ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString()
      : null;

    await upsertSocialAccount(sessionToken(req), {
      owner: session.userId,
      platform,
      platform_user_id: exchanged.platformUserId,
      account_name: exchanged.accountName,
      avatar_url: exchanged.avatarUrl ?? null,
      scopes: exchanged.scopes,
      status: "connected",
      access_token_enc: accessTokenEnc,
      refresh_token_enc: refreshTokenEnc,
      token_expires_at: expiresAt,
      meta: exchanged.meta ?? {},
    });

    await insertRow("audit_log", sessionToken(req), {
      owner: session.userId,
      action: "connect",
      detail: {
        platform,
        platformUserId: exchanged.platformUserId,
        scopes: exchanged.scopes,
      },
    });
  } catch (err) {
    return htmlPage("storage failed", `connected to ${adapter.name} but saving the tokens failed: ${(err as Error).message}`, 500);
  }

  const res = NextResponse.redirect(new URL(`/accounts?connected=${platform}`, url.origin), { status: 302 });
  res.cookies.set("sf_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}

function sessionToken(req: Request): string {
  return req.headers.get("cookie")?.match(/sf_session=([^;]+)/)?.[1] ?? "";
}
