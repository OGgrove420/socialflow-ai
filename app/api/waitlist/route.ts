import { NextResponse } from "next/server";

// waitlist capture. writes to the supabase `waitlist` table when configured;
// falls back to the local jsonl file so a missing env var degrades instead of
// losing the signup. supabase is the source of truth once it responds.
export async function POST(req: Request) {
  let email: string | undefined;
  try {
    const body = await req.formData();
    email = typeof body.get("email") === "string" ? String(body.get("email")).trim() : undefined;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Profile": "public",
          Prefer: "resolution=ignore-duplicates,return=minimal",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        return NextResponse.redirect(new URL("/waitlist-thanks", req.url), 303);
      }
      const errText = await res.text();
      console.error("waitlist supabase insert failed", res.status, errText);
      // ?src= marker is diagnostic only; visitors still get the thanks page
      return NextResponse.redirect(new URL(`/waitlist-thanks?src=http${res.status}`, req.url), 303);
    } catch (err) {
      console.error("waitlist supabase insert error", err);
      return NextResponse.redirect(new URL("/waitlist-thanks?src=fetcherror", req.url), 303);
    }
  }

  // fallback path (local dev / supabase outage). best-effort: fs may not be
  // writable on some hosts.
  const entry = JSON.stringify({ email, at: new Date().toISOString() }) + "\n";
  const { appendFile } = await import("fs/promises");
  try {
    await appendFile("data/waitlist.jsonl", entry);
  } catch {
    // the signup still counts as received
  }

  return NextResponse.redirect(new URL("/waitlist-thanks?src=noenv", req.url), 303);
}
