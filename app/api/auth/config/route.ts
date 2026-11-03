// GET /api/auth/config — public: returns the supabase url + anon key for the
// login page. both are public-by-design (the anon key ships in every client).
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "auth is not configured on this deployment" }, { status: 503 });
  }
  return NextResponse.json({
    supabaseUrl: url,
    anonKey,
  });
}
