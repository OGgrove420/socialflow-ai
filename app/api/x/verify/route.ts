import { NextResponse } from "next/server";

// x beta: verify the credentials actually work before letting anything queue
// a post. uses OAuth 1.0a user context (the access token pair) since posting
// on behalf of the holder's account needs user context, not app-only bearer.
// this route only ever calls the account verify endpoint and reports back
// what it finds; it never returns the credentials.

// minimal OAuth 1.0a HMAC-SHA256 signature for a GET with no body.
async function oauth1Header(
  method: string,
  url: string,
  creds: { apiKey: string; apiSecret: string; access: string; accessSecret: string },
): Promise<string> {
  const { randomBytes, createHmac } = await import("crypto");

  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.access,
    oauth_version: "1.0",
  };

  const params: Record<string, string> = { ...oauth };
  u.searchParams.forEach((v, k) => {
    params[k] = v;
  });

  const encode = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  const baseParams = Object.keys(params)
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join("&");
  const baseUrl = `${u.origin}${u.pathname}`;
  const baseString = `${method.toUpperCase()}&${encode(baseUrl)}&${encode(baseParams)}`;

  const signingKey = `${encode(creds.apiSecret)}&${encode(creds.accessSecret)}`;
  const signature = createHmac("sha256", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = { ...oauth, oauth_signature: signature };
  const header = "OAuth " + Object.keys(headerParams)
    .sort()
    .map((k) => `${encode(k)}="${encode(headerParams[k])}"`)
    .join(", ");
  return header;
}

export async function GET() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const access = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !access || !accessSecret) {
    const missing = [
      ["apiKey", apiKey],
      ["apiSecret", apiSecret],
      ["access", access],
      ["accessSecret", accessSecret],
    ].filter(([, v]) => !v).map(([k]) => k);
    return NextResponse.json(
      { ok: false, stage: "not-configured", missing },
      { status: 503 },
    );
  }

  try {
    const header = await oauth1Header("GET", "https://api.x.com/2/users/me", {
      apiKey,
      apiSecret,
      access,
      accessSecret,
    });
    const res = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: header },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("x verify failed", res.status, text.slice(0, 500));
      return NextResponse.json(
        { ok: false, stage: "x-rejected", httpStatus: res.status },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { data?: { username?: string; name?: string } };
    return NextResponse.json({
      ok: true,
      username: data.data?.username ?? null,
      name: data.data?.name ?? null,
    });
  } catch (err) {
    console.error("x verify error", err);
    return NextResponse.json({ ok: false, stage: "network-error" }, { status: 502 });
  }
}
