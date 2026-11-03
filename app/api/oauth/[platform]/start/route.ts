// GET /api/oauth/[platform]/start
// requires a session; creates the single-use state row (csrf + optional pkce
// verifier), sets the state cookie, and 302s to the platform's authorize url.
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getSessionFromRequest } from "@/lib/session";
import { getAdapter } from "@/lib/platforms";
import { insertRow } from "@/lib/db";

function sessionToken(req: Request): string {
  return req.headers.get("cookie")?.match(/sf_session=([^;]+)/)?.[1] ?? "";
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  const adapter = getAdapter(platform);
  if (!adapter) {
    return NextResponse.json({ error: `unknown platform: ${platform}` }, { status: 404 });
  }
  if (!adapter.credentialsConfigured()) {
    return NextResponse.json(
      {
        error: `${adapter.name} connection is not configured on this deployment yet`,
        missingEnv: [adapter.clientEnvId, adapter.clientEnvSecret],
        note: "the app owner registers the developer app centrally; users only authorise their accounts",
      },
      { status: 503 },
    );
  }

  const state = base64url(randomBytes(24));
  const codeVerifier = adapter.authType === "oauth2_pkce"
    ? base64url(randomBytes(48))
    : null;
  let codeChallenge: string | undefined;
  if (codeVerifier) {
    codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  }

  await insertRow("platform_app_state", sessionToken(req), {
    state,
    verifier: codeVerifier,
    owner: session.userId,
    redirect_to: new URL(req.url).searchParams.get("redirect_to") ?? "/accounts",
  });

  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const redirectUri = `${proto}://${host}/api/oauth/${platform}/callback`;

  const authorizeUrl = adapter.authorizeUrl({ state, redirectUri, codeChallenge });

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set("sf_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
