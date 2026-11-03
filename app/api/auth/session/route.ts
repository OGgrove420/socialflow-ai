// POST /api/auth/session — stores the supabase access token in an HttpOnly cookie.
// called after password sign-in; magic links arrive through /auth/callback.
import { NextResponse } from "next/server";
import { getSessionFromToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  let accessToken: string | undefined;
  try {
    const body = (await req.json()) as { access_token?: unknown };
    if (typeof body.access_token === "string") accessToken = body.access_token;
  } catch {
    return NextResponse.json({ error: "json body required" }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "access_token required" }, { status: 400 });
  }
  const session = await getSessionFromToken(accessToken);
  if (!session) {
    return NextResponse.json({ error: "token rejected by supabase" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, email: session.email });
  res.cookies.set(SESSION_COOKIE, accessToken, sessionCookieOptions());
  return res;
}
