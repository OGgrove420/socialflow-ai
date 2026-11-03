// pinterest adapter — oauth2 + pkce, v5 api.
// pins only (no text posts). image_url pulls require a claimed domain on the
// pinterest business account; pin creation needs board_id which the connector
// stores as meta.defaultBoardId when it can list boards.
import {
  hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";

const AUTHORIZE = "https://www.pinterest.com/oauth/";
const TOKEN = "https://api.pinterest.com/v5/oauth/token";
const SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];

type PinterestBoards = {
  items?: { id: string; name: string }[];
};

export const pinterestAdapter: PlatformAdapter = {
  id: "pinterest",
  name: "Pinterest",
  authType: "oauth2_pkce",
  clientEnvId: "SF_PINTEREST_CLIENT_ID",
  clientEnvSecret: "SF_PINTEREST_CLIENT_SECRET",
  credentialsConfigured: () =>
    hasEnv("SF_PINTEREST_CLIENT_ID") && hasEnv("SF_PINTEREST_CLIENT_SECRET"),

  authorizeUrl({ state, codeChallenge }) {
    const params = new URLSearchParams({
      client_id: process.env.SF_PINTEREST_CLIENT_ID ?? "",
      redirect_uri: redirectUriFor("pinterest"),
      response_type: "code",
      scope: SCOPES.join(","),
      state,
    });
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `${AUTHORIZE}?${params}`;
  },

  async exchangeCode(code, redirectUri, codeVerifier) {
    const data = await postForm(TOKEN, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }, {
      user: requireEnv("SF_PINTEREST_CLIENT_ID"),
      pass: requireEnv("SF_PINTEREST_CLIENT_SECRET"),
    });
    const accessToken = String(data.access_token ?? "");
    if (!accessToken) throw new Error("no access_token in pinterest response");

    const meRes = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = (await meRes.json().catch(() => ({}))) as {
      username?: string; profile_image?: string;
    };
    // grab the first board for default pin target
    let boardId: string | null = null;
    try {
      const bRes = await fetch("https://api.pinterest.com/v5/boards?page_size=1", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const b = (await bRes.json().catch(() => ({}))) as PinterestBoards;
      boardId = b.items?.[0]?.id ?? null;
    } catch { /* boards optional */ }

    return {
      accessToken,
      refreshToken: data.refresh_token ? String(data.refresh_token) : null,
      expiresIn: data.expires_in ? Number(data.expires_in) : null,
      scopes: SCOPES,
      platformUserId: me.username ?? "unknown",
      accountName: me.username ? `@${me.username}` : "Pinterest account",
      avatarUrl: me.profile_image ?? null,
      meta: { defaultBoardId: boardId },
    };
  },

  capabilities: {
    text: false,
    image: true,
    video: true,
    reels: false,
    stories: false,
    carousel: false,
    schedule: false,
    analytics: false,
    comments: false,
    maxCaption: 500,
    notes: [
      "pins only: an image or video plus description",
      "image urls must come from a domain claimed on your pinterest business account",
      "pins need a board; the connector saves your first board as default",
    ],
  },

  async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
    const boardId = (account.meta.defaultBoardId as string) ?? null;
    if (!boardId) {
      throw Object.assign(
        new Error("no board available: create a board on pinterest and reconnect"),
        { status: 422, stage: "pin-no-board" },
      );
    }
    const [image] = input.mediaUrls.filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u));
    const [video] = input.mediaUrls.filter((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u));
    if (!image && !video) {
      throw Object.assign(
        new Error("pinterest pins need an image or video; text-only is not a pin"),
        { status: 422, stage: "pin-needs-media" },
      );
    }
    const body: Record<string, unknown> = {
      board_id: boardId,
      description: input.caption.slice(0, 500),
    };
    if (video) body.media_source = { source_type: "video_url", cover_image_url: image ?? "", data: { video_url: video } };
    else body.image_url = image;

    const res = await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string; message?: string; detail?: string;
    };
    if (!res.ok || !data.id) {
      throw Object.assign(
        new Error(data.message ?? data.detail ?? "pinterest pin creation failed"),
        { status: res.status, stage: "pin-create" },
      );
    }
    return {
      remoteId: data.id,
      remoteUrl: `https://www.pinterest.com/pin/${data.id}/`,
      warnings: undefined,
    };
  },

  fallbackNote:
    "prepares the image and description, then opens pinterest's pin builder for a manual pin.",

  reviewRequired: true,
  reviewNote:
    "write scopes (pins:write) need pinterest developer app approval; image pulls need a claimed domain.",
};
