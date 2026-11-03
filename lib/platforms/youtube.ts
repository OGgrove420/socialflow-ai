// youtube adapter — google oauth2 + pkce, resumable upload for videos.
// default quota (10,000 units/day, upload = 1,600) means roughly 6 uploads/day
// on an unverified project. shorts are just vertical videos <= 60s.
import {
  hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "openid",
  "profile",
];

type GoogleToken = { access_token?: string; refresh_token?: string; expires_in?: number };

export const youtubeAdapter: PlatformAdapter = {
  id: "youtube",
  name: "YouTube",
  authType: "oauth2_pkce",
  clientEnvId: "SF_YOUTUBE_CLIENT_ID",
  clientEnvSecret: "SF_YOUTUBE_CLIENT_SECRET",
  credentialsConfigured: () =>
    hasEnv("SF_YOUTUBE_CLIENT_ID") && hasEnv("SF_YOUTUBE_CLIENT_SECRET"),

  authorizeUrl({ state, codeChallenge }) {
    const params = new URLSearchParams({
      client_id: process.env.SF_YOUTUBE_CLIENT_ID ?? "",
      redirect_uri: redirectUriFor("youtube"),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline", // we want refresh tokens
      prompt: "consent",
      state,
    });
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri, codeVerifier) {
    const data = (await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: requireEnv("SF_YOUTUBE_CLIENT_ID"),
      client_secret: requireEnv("SF_YOUTUBE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    })) as GoogleToken;
    const accessToken = data.access_token ?? "";
    if (!accessToken) throw new Error("no access_token in google response");

    const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = (await meRes.json().catch(() => ({}))) as {
      id?: string; name?: string; picture?: string;
    };
    return {
      accessToken,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? null,
      scopes: SCOPES,
      platformUserId: me.id ?? "unknown",
      accountName: me.name ?? "YouTube account",
      avatarUrl: me.picture ?? null,
    };
  },

  async refreshToken(refreshToken) {
    const data = (await postForm("https://oauth2.googleapis.com/token", {
      client_id: requireEnv("SF_YOUTUBE_CLIENT_ID"),
      client_secret: requireEnv("SF_YOUTUBE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })) as GoogleToken;
    return {
      accessToken: data.access_token ?? "",
      refreshToken, // google refresh tokens are long-lived and reused
      expiresIn: data.expires_in ?? null,
      scopes: SCOPES,
      platformUserId: "preserved",
      accountName: "preserved",
    };
  },

  capabilities: {
    text: false,
    image: false,
    video: true,
    reels: true, // shorts
    stories: false,
    carousel: false,
    schedule: true, // status.publishAt
    analytics: false,
    comments: false,
    maxCaption: 5000, // description; title capped at 100 separately
    notes: [
      "video only: captions/descriptions travel with the video",
      "shorts = vertical video <= 60s; anything else is a regular upload",
      "quota: ~6 uploads/day on an unverified google cloud project",
      "scheduling via status.publishAt with privacyStatus=private",
      "uploads are public by default here; change to unlisted in youtube studio",
    ],
  },

  async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
    const [video] = input.mediaUrls.filter((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u));
    if (!video) {
      throw Object.assign(
        new Error("youtube publishing needs an mp4/mov/webm video url"),
        { status: 422, stage: "yt-needs-video" },
      );
    }
    const title = input.caption.slice(0, 100) || "SocialFlow upload";
    const description = input.caption.slice(0, 5000);
    const status: Record<string, unknown> = {
      privacyStatus: input.scheduledAt ? "private" : "public",
      selfDeclaredMadeForKids: false,
    };
    if (input.scheduledAt) {
      status.publishAt = input.scheduledAt;
    }

    // 1. init resumable session
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          snippet: { title, description, categoryId: "22" },
          status,
        }),
      },
    );
    const uploadUrl = initRes.headers.get("location");
    if (!initRes.ok || !uploadUrl) {
      const text = await initRes.text();
      throw Object.assign(
        new Error(`youtube upload init failed: ${text.slice(0, 200)}`),
        { status: initRes.status, stage: "yt-init" },
      );
    }

    // 2. stream the video into the session
    const vidRes = await fetch(video);
    if (!vidRes.ok) {
      throw Object.assign(new Error("could not fetch the video url"), {
        status: 422, stage: "yt-fetch-media",
      });
    }
    const bytes = new Uint8Array(Buffer.from(await vidRes.arrayBuffer()));
    const upRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": vidRes.headers.get("content-type") ?? "video/mp4" },
      body: bytes,
    });
    const upData = (await upRes.json().catch(() => ({}))) as {
      id?: string; kind?: string;
    };
    if (!upRes.ok || !upData.id) {
      throw Object.assign(new Error("youtube resumable upload failed"), {
        status: upRes.status, stage: "yt-upload",
      });
    }
    return {
      remoteId: upData.id,
      remoteUrl: `https://www.youtube.com/watch?v=${upData.id}`,
      warnings: input.scheduledAt
        ? ["uploaded private; goes public at the scheduled publishAt time"]
        : undefined,
    };
  },

  fallbackNote:
    "gives you the video file plus title/description ready to upload in youtube studio.",

  reviewRequired: true,
  reviewNote:
    "google cloud project must enable youtube data api v3; uploads count against quota (~6/day unverified).",
};
