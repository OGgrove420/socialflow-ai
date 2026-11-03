// x (twitter) adapter — oauth2 with pkce, v2 api bearer posting.
// the legacy single-account oauth 1.0a routes (/api/x/*) stay untouched;
// this adapter adds per-user connected accounts through the modern flow.
// write access needs a paid api tier for meaningful volume; free tier is
// severely limited. offline.access gives us the refresh token.
import {
  base64url, hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";
import { webcrypto } from "node:crypto";

const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const TOKEN = "https://api.x.com/2/oauth2/token";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

export const xAdapter: PlatformAdapter = {
  id: "x",
  name: "X",
  authType: "oauth2_pkce",
  clientEnvId: "SF_X_CLIENT_ID",
  clientEnvSecret: "SF_X_CLIENT_SECRET",
  credentialsConfigured: () => hasEnv("SF_X_CLIENT_ID") && hasEnv("SF_X_CLIENT_SECRET"),

  authorizeUrl({ state, codeChallenge }) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.SF_X_CLIENT_ID ?? "",
      redirect_uri: redirectUriFor("x"),
      scope: SCOPES.join(" "),
      state,
      code_challenge: codeChallenge ?? "",
      code_challenge_method: "S256",
    });
    return `${AUTHORIZE}?${params}`;
  },

  async exchangeCode(code, redirectUri, codeVerifier) {
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: requireEnv("SF_X_CLIENT_ID"),
      // pkce flows on x use client_id auth, not basic
      code_verifier: codeVerifier ?? "",
    };
    const data = await postForm(TOKEN, params);
    const accessToken = String(data.access_token ?? "");
    if (!accessToken) throw new Error("no access_token in x response");

    const meRes = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,name", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = (await meRes.json().catch(() => ({}))) as {
      data?: { id?: string; username?: string; name?: string; profile_image_url?: string };
    };
    if (!meRes.ok) {
      throw Object.assign(new Error("x /2/users/me failed"), { status: meRes.status, stage: "x-me" });
    }
    return {
      accessToken,
      refreshToken: data.refresh_token ? String(data.refresh_token) : null,
      expiresIn: data.expires_in ? Number(data.expires_in) : null,
      scopes: SCOPES,
      platformUserId: me.data?.id ?? "unknown",
      accountName: me.data?.username ? `@${me.data.username}` : (me.data?.name ?? "X account"),
      avatarUrl: me.data?.profile_image_url?.replace("_normal", "_400x400") ?? null,
    };
  },

  async refreshToken(refreshToken) {
    const data = await postForm(TOKEN, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: requireEnv("SF_X_CLIENT_ID"),
    });
    const accessToken = String(data.access_token ?? "");
    if (!accessToken) throw new Error("no access_token in x refresh response");
    return {
      accessToken,
      refreshToken: data.refresh_token ? String(data.refresh_token) : refreshToken,
      expiresIn: data.expires_in ? Number(data.expires_in) : null,
      scopes: SCOPES,
      platformUserId: "preserved",
      accountName: "preserved",
    };
  },

  capabilities: {
    text: true,
    image: false, // v2 media upload endpoint needed; free tier restricts media
    video: false,
    reels: false,
    stories: false,
    carousel: false,
    schedule: true,
    analytics: false,
    comments: true,
    maxCaption: 280,
    notes: [
      "280 character limit enforced",
      "media posting via api requires a paid x api tier",
      "scheduling available on paid tiers only; free tier posts immediately",
      "legacy single-account oauth 1.0a posting still available via /api/x/*",
    ],
  },

  async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.caption.slice(0, 280) }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; text?: string };
      errors?: { message?: string }[];
      detail?: string;
      title?: string;
    };
    if (!res.ok) {
      const msg =
        data.errors?.[0]?.message ?? data.detail ?? data.title ?? "x rejected the post";
      throw Object.assign(new Error(msg), { status: res.status, stage: "x-post" });
    }
    return {
      remoteId: data.data?.id ?? null,
      remoteUrl: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : null,
      warnings: input.mediaUrls.length
        ? ["media dropped: x api tier does not permit media upload on this app"]
        : undefined,
    };
  },

  fallbackNote:
    "prepares the text with a copy button and opens x compose in a new tab.",

  reviewRequired: false,
  reviewNote:
    "no app review, but the developer.x.com app needs user authentication settings enabled with the callback url registered, and write volume follows your api tier.",
};
