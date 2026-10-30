import { NextResponse } from "next/server";

// waitlist capture. no database yet (supabase lands at the auth milestone),
// so entries go to a local jsonl file. migrated to supabase when it exists.
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

  const entry = JSON.stringify({ email, at: new Date().toISOString() }) + "\n";
  const { appendFile } = await import("fs/promises");
  try {
    await appendFile("data/waitlist.jsonl", entry);
  } catch {
    // fs may not be writable on some hosts — the signup still counts as received
  }

  return NextResponse.redirect(new URL("/waitlist-thanks", req.url), 303);
}
