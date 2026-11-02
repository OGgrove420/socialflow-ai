import { NextResponse } from "next/server";

// x beta api status. reports whether the holder's X credentials are wired as
// vercel env vars yet. never leaks the key material itself.
export async function GET() {
  const bearer = process.env.X_BEARER_TOKEN;
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const access = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  const parts = {
    bearer: Boolean(bearer),
    apiKey: Boolean(apiKey),
    apiSecret: Boolean(apiSecret),
    access: Boolean(access),
    accessSecret: Boolean(accessSecret),
  };
  const ready = parts.bearer && parts.access && parts.accessSecret;

  return NextResponse.json({
    platform: "x",
    ready,
    missing: Object.entries(parts)
      .filter(([, present]) => !present)
      .map(([name]) => name),
  });
}
