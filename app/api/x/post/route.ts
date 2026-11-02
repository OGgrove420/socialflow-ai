import { NextResponse } from "next/server";

// x beta: post a single tweet through OAuth 1.0a user context.
// beta rules: text only, one post per call, 280 chars enforced server-side.
// when queue mode is on (X_QUEUE_MODE=1) posts are refused and must go
// through the approve endpoint instead, so nothing goes out un-reviewed.

const MAX_LEN = 280;

async function oauth1Header(
  method: string,
  url: string,
  creds: { apiKey: string; apiSecret: string; access: string; accessSecret: string },
  bodyKeys: string[] = [],
): Promise<string> {
  const { randomBytes, createHmac } = await import("crypto");

  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.access,
    oauth_version: "1.0",
  };

  // for json bodies the signature covers only the oauth params (the body is
  // signed via the length digest is not required for v2 posting with 1.0a
  // user context; x accepts oauth params-only signature for json posts).
  const params: Record<string, string> = { ...oauth };
  void bodyKeys;

  const encode = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  const baseParams = Object.keys(params)
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join("&");
  const u = new URL(url);
  const baseString = `${method.toUpperCase()}&${encode(`${u.origin}${u.pathname}`)}&${encode(baseParams)}`;

  const signingKey = `${encode(creds.apiSecret)}&${encode(creds.accessSecret)}`;
  const signature = createHmac("sha256", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${encode(k)}="${encode(headerParams[k])}"`)
      .join(", ")
  );
}

export async function POST(req: Request) {
  let text: string | undefined;
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text;
  } catch {
    return NextResponse.json({ error: "json body required" }, { status: 400 });
  }

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json(
      { error: `too long: ${text.length}/${MAX_LEN} characters` },
      { status: 422 },
    );
  }

  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const access = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !access || !accessSecret) {
    return NextResponse.json(
      { error: "x credentials not configured on the server yet" },
      { status: 503 },
    );
  }

  if (process.env.X_QUEUE_MODE === "1") {
    return NextResponse.json(
      { error: "queue mode is on: posts must be approved via /api/x/approve", queued: false },
      { status: 409 },
    );
  }

  try {
    const header = await oauth1Header("POST", "https://api.x.com/2/tweets", {
      apiKey,
      apiSecret,
      access,
      accessSecret,
    });
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: header,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; text?: string };
      errors?: { message?: string }[];
    };
    if (!res.ok) {
      console.error("x post failed", res.status, JSON.stringify(payload).slice(0, 500));
      return NextResponse.json(
        {
          error: "x rejected the post",
          httpStatus: res.status,
          detail: payload.errors?.[0]?.message ?? null,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, id: payload.data?.id ?? null, text: payload.data?.text ?? text });
  } catch (err) {
    console.error("x post error", err);
    return NextResponse.json({ error: "network error reaching x" }, { status: 502 });
  }
}
