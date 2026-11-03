// tiktok adapter — oauth2 + pkce, content posting api (video only).
// unaudited apps can only publish private (self-only) posts; public posting
// needs tiktok's audit approval. this adapter posts with draft/private defaults
// until the app is approved.
import {
  hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const SCOPES = ["user.info.basic", "video.publish"];

export const tiktokAdapter: PlatformAdapter = {
  id: "tiktok",
  name: "TikTok",
  authType: "oauth2_pkce",
  clientEnvId: "SF_TIKTOK_CLIENT_ID",
  clientEnvSecret: "SF_TIKTOK_CLIENT_SECRET",
  credentialsConfigured: () =>
    hasEnv("SF_TIKTOK_CLIENT_ID") && hasEnv("SF_TIKTOK_CLIENT_SECRET"),

  authorizeUrl({ state, codeChallenge }) {
    const params = new URLSearchParams({
      client_key: process.env.SF_TIKTOK_CLIENT_ID ?? "",
      redirect_uri: redirectUriFor("tiktok"),
      state,
      scope: SCOPES.join(","),
      response_type: "code",
    });
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `${AUTHORIZE}?${params}`;
  },

  async exchangeCode(code, redirectUri, codeVerifier) {
    const params: Record<string, string> = {
      client_key: requireEnv("SF_TIKTOK_CLIENT_ID"),
      client_secret: requireEnv("SF_TIKTOK_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };
    if (codeVerifier) params.code_verifier = codeVerifier;
    const data = await postForm(TOKEN, params);
    const accessToken = String(data.access_token ?? "");
    if (!accessToken) throw new Error("no access_token in tiktok response");

    const meRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const me = (await meRes.json().catch(() => ({}))) as {
      data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
    };
    return {
      accessToken,
      refreshToken: data.refresh_token ? String(data.refresh_token) : null,
      expiresIn: data.expires_in ? Number(data.expires_in) : null,
      scopes: SCOPES,
      platformUserId: me.data?.user?.open_id ?? "unknown",
      accountName: me.data?.user?.display_name ?? "TikTok account",
      avatarUrl: me.data?.user?.avatar_url ?? null,
    };
  },

  capabilities: {
    text: false,
    image: false,
    video: true,
    reels: true,
    stories: false,
    carousel: false,
    schedule: false,
    analytics: false,
    comments: false,
    maxCaption: 2200,
    notes: [
      "video publishing only; caption travels with the video",
      "until your tiktok app passes audit, published videos are private (self only)",
      "media must be reachable by tiktok servers via public url (PULL_FROM_URL)",
    ],
  },

  async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
    const [video] = input.mediaUrls.filter((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u));
    if (!video) {
      throw Object.assign(
        new Error("tiktok publishing needs an mp4/mov video url"),
        { status: 422, stage: "tiktok-needs-video" },
      );
    }
    const res = await fetch(INIT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: input.caption.slice(0, 2200),
          privacy_level: "SELF_ONLY", // public requires audited app
          disable_comment: false,
        },
        source_info: { source: "PULL_FROM_URL", video_url: video },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { publish_id?: string };
      error?: { message?: string };
    };
    if (!res.ok || !data.data?.publish_id) {
      throw Object.assign(
        new Error(data.error?.message ?? "tiktok video init failed"),
        { status: res.status, stage: "tiktok-init" },
      );
    }
    return {
      remoteId: data.data.publish_id,
      remoteUrl: null,
      warnings: ["posted private (SELF_ONLY) until the tiktok app is audited"],
    };
  },

  fallbackNote:
    "at publish time you get the video and caption ready to post in the official tiktok app.",

  reviewRequired: true,
  reviewNote:
    "tiktok content posting api requires an app audit; unaudited posts are private only.",
};
