// instagram professional account adapter — graph api v21.0 via facebook login.
// requires an IG professional (business/creator) account linked to a facebook
// page. publishing = 2-step container flow (POST /media then /media_publish).
// hard limits: 25 api-published posts per ig account per 24h. images + reels
// only; stories and carousels are not supported by the content publishing api.
import {
  hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";
const SCOPES = [
  "instagram_basic",
  "instagram_content_api_publish",
  "pages_show_list",
  "pages_manage_metadata",
  "business_management",
];

type IgMediaContainer = { id?: string; error?: { message?: string; type?: string } };

async function findIgUser(userToken: string): Promise<{
  igUserId: string; igName: string; avatarUrl: string | null; pageId: string;
} | null> {
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(userToken)}`,
  );
  const pages = (await pagesRes.json().catch(() => ({}))) as {
    data?: {
      id: string;
      name: string;
      instagram_business_account?: {
        id: string; username?: string; profile_picture_url?: string;
      };
    }[];
  };
  for (const page of pages.data ?? []) {
    const ig = page.instagram_business_account;
    if (ig?.id) {
      return {
        igUserId: ig.id,
        igName: ig.username ?? page.name,
        avatarUrl: ig.profile_picture_url ?? null,
        pageId: page.id,
      };
    }
  }
  return null;
}

export const instagramAdapter: PlatformAdapter = {
  id: "instagram",
  name: "Instagram Professional",
  authType: "oauth2",
  clientEnvId: "SF_FACEBOOK_CLIENT_ID", // same meta app as facebook
  clientEnvSecret: "SF_FACEBOOK_CLIENT_SECRET",
  credentialsConfigured: () => hasEnv("SF_FACEBOOK_CLIENT_ID") && hasEnv("SF_FACEBOOK_CLIENT_SECRET"),

  authorizeUrl({ state }) {
    const params = new URLSearchParams({
      client_id: process.env.SF_FACEBOOK_CLIENT_ID ?? "",
      redirect_uri: redirectUriFor("instagram"),
      state,
      scope: SCOPES.join(","),
      response_type: "code",
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const data = await postForm(`${GRAPH}/oauth/access_token`, {
      client_id: requireEnv("SF_FACEBOOK_CLIENT_ID"),
      client_secret: requireEnv("SF_FACEBOOK_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      code,
    });
    const shortToken = String(data.access_token ?? "");
    if (!shortToken) throw new Error("no access_token in facebook response");
    const long = await postForm(`${GRAPH}/oauth/access_token`, {
      grant_type: "fb_exchange_token",
      client_id: requireEnv("SF_FACEBOOK_CLIENT_ID"),
      client_secret: requireEnv("SF_FACEBOOK_CLIENT_SECRET"),
      fb_exchange_token: shortToken,
    });
    const userToken = String(long.access_token ?? shortToken);
    const expiresIn = long.expires_in ? Number(long.expires_in) : null;

    const ig = await findIgUser(userToken);
    if (!ig) {
      throw Object.assign(
        new Error(
          "no instagram professional account is linked to any facebook page on this login. link one in instagram settings (business/creator account -> connected facebook page) and retry.",
        ),
        { status: 422, stage: "no-ig-account" },
      );
    }
    // the page token is what the container flow needs for media object creation
    const tokenRes = await fetch(
      `${GRAPH}/${ig.pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    const tokenData = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    return {
      accessToken: tokenData.access_token ?? userToken,
      refreshToken: userToken,
      expiresIn: null,
      scopes: SCOPES,
      platformUserId: ig.igUserId,
      accountName: ig.igName,
      avatarUrl: ig.avatarUrl,
      meta: { kind: "ig_professional", pageId: ig.pageId, userTokenExpiresIn: expiresIn ?? null },
    };
  },

  capabilities: {
    text: true,
    image: true,
    video: true,
    reels: true,
    stories: false,
    carousel: false,
    schedule: false,
    analytics: true,
    comments: true,
    maxCaption: 2200,
    notes: [
      "professional (business/creator) account linked to a facebook page required",
      "images and reels only; stories and carousels are not supported by the api",
      "hard cap: 25 api-published posts per account per 24 hours",
      "media must be reachable by instagram's servers via public url",
    ],
  },

  async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
    const igUserId = account.platformUserId;
    const warnings: string[] = [];
    const [video] = input.mediaUrls.filter((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u));
    const [image] = input.mediaUrls.filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u));

    const mediaType: Record<string, string> = video
      ? { media_type: "REELS", video_url: video }
      : image
        ? { image_url: image }
        : null as unknown as Record<string, string>;
    if (!mediaType) {
      throw Object.assign(
        new Error(
          "instagram api publishing needs an image or video; text-only posts are not supported by the api. use the fallback instead.",
        ),
        { status: 422, stage: "ig-needs-media" },
      );
    }

    const params = new URLSearchParams({
      access_token: accessToken,
      caption: input.caption.slice(0, 2200),
      ...mediaType,
    });
    const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const created = (await createRes.json().catch(() => ({}))) as IgMediaContainer;
    if (!createRes.ok || !created.id) {
      throw Object.assign(
        new Error(created.error?.message ?? "instagram media container failed"),
        { status: createRes.status, stage: "ig-container" },
      );
    }

    // container processing can take a moment for video; poll status until finished
    if (video) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await fetch(
          `${GRAPH}/${created.id}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
        );
        const status = (await statusRes.json().catch(() => ({}))) as { status_code?: string };
        if (status.status_code === "FINISHED") break;
        if (status.status_code === "ERROR") {
          throw Object.assign(new Error("instagram container processing failed"), {
            status: 502, stage: "ig-processing",
          });
        }
      }
      warnings.push("reel container processed before publish");
    }

    const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: accessToken,
        creation_id: created.id,
      }).toString(),
    });
    const published = (await publishRes.json().catch(() => ({}))) as IgMediaContainer;
    if (!publishRes.ok || !published.id) {
      throw Object.assign(
        new Error(published.error?.message ?? "instagram media_publish failed"),
        { status: publishRes.status, stage: "ig-publish" },
      );
    }
    return {
      remoteId: published.id,
      remoteUrl: null,
      warnings: [...warnings, "published now; instagram api has no scheduled publishing"],
    };
  },

  fallbackNote:
    "instagram has no scheduled publishing via api: the scheduler saves your caption and media, and at the chosen time you get a ready-to-paste package that opens instagram.",

  reviewRequired: true,
  reviewNote:
    "requires instagram_content_api_publish in meta app review; 25 posts/24h cap; professional account required.",
};

export const instagramRedirectPath = `/api/oauth/instagram/callback`;
