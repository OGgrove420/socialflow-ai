// session helpers: the session is a Supabase auth JWT stored in an HttpOnly cookie.
// verification goes through the Supabase auth API using the anon key.
// this module never logs the token and never returns it to callers.
import { cookies } from "next/headers";

export const SESSION_COOKIE = "sf_session";

export type Session = { userId: string; email: string | null };

export function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL not set on the server");
  return url.replace(/\/$/, "");
}

export function supabaseAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_ANON_KEY not set on the server");
  return key;
}

// verifies the cookie's JWT against supabase auth; returns null when invalid.
export async function getSessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey(),
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; email?: string };
    if (!data.id) return null;
    return { userId: data.id, email: data.email ?? null };
  } catch {
    return null;
  }
}

// server-component / route-handler helper reading the cookie store
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return getSessionFromToken(store.get(SESSION_COOKIE)?.value);
}

// route-handler helper reading the request directly
export async function getSessionFromRequest(req: Request): Promise<Session | null> {
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return getSessionFromToken(match?.[1]);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days; supabase refresh is out of scope for stage 1
  };
}
