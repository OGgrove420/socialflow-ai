// platform adapter contract. every platform implements this interface and is
// registered in lib/platforms/index.ts. adapters must not import each other.
// all token values handled here are plaintext only inside server memory:
// callers decrypt before publish(), adapters never log them.

export type PlatformId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "linkedin_page"
  | "x"
  | "youtube"
  | "pinterest";

export type AuthType = "oauth2" | "oauth2_pkce";

export type Capabilities = {
  text: boolean;
  image: boolean;
  video: boolean;
  reels: boolean;
  stories: boolean;
  carousel: boolean;
  schedule: boolean;
  analytics: boolean;
  comments: boolean;
  maxCaption: number;
  notes: string[];
};

export type AuthorizeOpts = {
  state: string;
  redirectUri: string;
  codeChallenge?: string; // set when authType is oauth2_pkce
};

export type ExchangeResult = {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null; // seconds until expiry, null/undefined = unknown/long-lived
  scopes: string[];
  platformUserId: string;
  accountName: string;
  avatarUrl?: string | null;
  meta?: Record<string, unknown>;
};

export type PublishInput = {
  caption: string;
  mediaUrls: string[]; // public https urls the platform servers can pull from
  scheduledAt?: string | null; // iso timestamp when scheduling is supported
};

export type PublishOutput = {
  remoteId?: string | null;
  remoteUrl?: string | null;
  warnings?: string[];
};

export type PublishAccount = {
  platformUserId: string;
  accountName: string;
  meta: Record<string, unknown>;
};

export type PlatformAdapter = {
  id: PlatformId;
  name: string;
  authType: AuthType;
  clientEnvId: string; // env var name for client id
  clientEnvSecret: string; // env var name for client secret
  credentialsConfigured(): boolean;
  authorizeUrl(opts: AuthorizeOpts): string;
  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<ExchangeResult>;
  refreshToken?(refreshToken: string): Promise<ExchangeResult>;
  capabilities: Capabilities;
  publish(
    account: PublishAccount,
    accessToken: string,
    input: PublishInput,
  ): Promise<PublishOutput>;
  fallbackNote: string;
  reviewRequired: boolean;
  reviewNote?: string;
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} is not set on the server`);
  return v;
}

export function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

// site url for building redirect uris on the fly
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

export function redirectUriFor(platform: string): string {
  return `${siteUrl()}/api/oauth/${platform}/callback`;
}

// base64url helpers for pkce
export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function postForm(
  url: string,
  params: Record<string, string>,
  basicAuth?: { user: string; pass: string },
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (basicAuth) {
    const cred = Buffer.from(`${basicAuth.user}:${basicAuth.pass}`).toString("base64");
    headers.Authorization = `Basic ${cred}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof data.error_description === "string"
      ? data.error_description
      : typeof data.error === "string"
        ? data.error
        : JSON.stringify(data).slice(0, 300);
    throw Object.assign(new Error(`token endpoint ${res.status}: ${detail}`), { status: res.status });
  }
  return data;
}
