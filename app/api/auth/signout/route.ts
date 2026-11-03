// POST /api/auth/signout — clears the session cookie and revokes the supabase session.
import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  if (token) {
    try {
      await fetch(`${supabaseUrl()}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey() },
      });
    } catch {
      // revocation is best-effort; the cookie is cleared regardless
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
