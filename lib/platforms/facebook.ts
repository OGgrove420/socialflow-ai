// facebook pages adapter — graph api v21.0
// oauth2 (no pkce on the meta web login). scopes gate publishing behind
// meta app review; until approved the connection works only for accounts
// with roles on the app (dev/tester mode).
import {
  hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";
const SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
  "business_management",
];

export const facebookAdapter: PlatformAdapter = {
  id: "facebook",
  name: "Facebook Pages",
  authType: "oauth2",
  clientEnvId: "SF_FACEBOOK_CLIENT_ID",
  clientEnvSecret: "SF_FACEBOOK_CLIENT_SECRET",
  credentialsConfigured: () => hasEnv("SF_FACEBOOK_CLIENT_ID") && hasEnv("SF_FACEBOOK_CLIENT_SECRET"),

  authorizeUrl({ state }) {
    const params = new URLSearchParams({
      client_id: process.env.SF_FACEBOOK_CLIENT_ID ?? "",
      redirect_uri: redirectUriFor("facebook"),
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
    // exchange for long-lived (~60 days)
    const long = await postForm(`${GRAPH}/oauth/access_token`, {
      grant_type: "fb_exchange_token",
      client_id: requireEnv("SF_FACEBOOK_CLIENT_ID"),
      client_secret: requireEnv("SF_FACEBOOK_CLIENT_SECRET"),
      fb_exchange_token: shortToken,
    });
    const accessToken = String(long.access_token ?? shortToken);
    const expiresIn = long.expires_in ? Number(long.expires_in) : null;

    // identify the user and their pages; we publish as a page, so the
    // "account" is a page. store the first manageable page as this account.
    const meRes = await fetch(`${GRAPH}/me?fields=id,name,picture&access_token=${encodeURIComponent(accessToken)}`);
    const me = (await meRes.json().catch(() => ({}))) as {
      id?: string; name?: string; picture?: { data?: { url?: string } };
    };
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token,cover,picture&access_token=${encodeURIComponent(accessToken)}`,
    );
    const pages = (await pagesRes.json().catch(() => ({}))) as {
      data?: { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }[];
    };
    const page = pages.data?.[0];
    if (page) {
      // page access tokens do not expire when derived from a long-lived user token
      return {
        accessToken: page.access_token,
        refreshToken: accessToken, // keep the user token as refresh material
        expiresIn: null,
        scopes: SCOPES,
        platformUserId: page.id,
        accountName: page.name,
        avatarUrl: page.picture?.data?.url ?? me.picture?.data?.url ?? null,
        meta: { kind: "page", userTokenExpiresIn: expiresIn ?? null },
      };
    }
    return {
      accessToken,
      refreshToken: null,
      expiresIn,
      scopes: SCOPES,
      platformUserId: me.id ?? "unknown",
      accountName: me.name ?? "Facebook account",
      avatarUrl: me.picture?.data?.url ?? null,
      meta: { kind: "user", warning: "no page found on this account; page publishing needs a page" },
    };
  },

  capabilities: {
    text: true,
    image: true,
    video: true,
    reels: true,
    stories: false,
    carousel: true,
    schedule: true,
    analytics: true,
    comments: true,
    maxCaption: 5000,
    notes: [
      "publishes to pages, not personal profiles (platform policy)",
      "images via /{page-id}/photos with a public url",
      "video via /{page-id}/videos",
      "scheduling via published=false + scheduled_publish_time",
    ],
  },

  async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
    const pageId = account.platformUserId;
    const warnings: string[] = [];
    const [image] = input.mediaUrls.filter((u) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u));
    const [video] = input.mediaUrls.filter((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u));

    if (video) {
      const params = new URLSearchParams({
        access_token: accessToken,
        file_url: video,
        description: input.caption,
      });
      if (input.scheduledAt) {
        params.set("published", "false");
        params.set("scheduled_publish_time", String(Math.floor(new Date(input.scheduledAt).getTime() / 1000)));
        warnings.push("scheduled as an unpublished video per facebook scheduling api");
      }
      const res = await fetch(`${GRAPH}/${pageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!res.ok) throw Object.assign(new Error(data.error?.message ?? "facebook video publish failed"), { status: res.status });
      return {
        remoteId: data.id ?? null,
        remoteUrl: data.id ? `https://www.facebook.com/${data.id}` : null,
        warnings,
      };
    }

    if (image) {
      const params = new URLSearchParams({
        access_token: accessToken,
        url: image,
        caption: input.caption,
      });
      if (input.scheduledAt) {
        params.set("published", "false");
        params.set("scheduled_publish_time", String(Math.floor(new Date(input.scheduledAt).getTime() / 1000)));
        warnings.push("scheduled as an unpublished photo per facebook scheduling api");
      }
      const res = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = (await res.json().catch(() => ({}))) as { post_id?: string; id?: string; error?: { message?: string } };
      if (!res.ok) throw Object.assign(new Error(data.error?.message ?? "facebook photo publish failed"), { status: res.status });
      const id = data.post_id ?? data.id ?? null;
      return { remoteId: id, remoteUrl: id ? `https://www.facebook.com/${id}` : null, warnings };
    }

    const params = new URLSearchParams({
      access_token: accessToken,
      message: input.caption,
    });
    if (input.scheduledAt) {
      params.set("published", "false");
      params.set("scheduled_publish_time", String(Math.floor(new Date(input.scheduledAt).getTime() / 1000)));
      warnings.push("scheduled as an unpublished feed post per facebook scheduling api");
    }
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok) throw Object.assign(new Error(data.error?.message ?? "facebook feed publish failed"), { status: res.status });
    return { remoteId: data.id ?? null, remoteUrl: data.id ? `https://www.facebook.com/${data.id}` : null, warnings };
  },

  fallbackNote:
    "prepares your caption and media, then opens facebook in the official app/site to post manually.",

  reviewRequired: true,
  reviewNote:
    "meta app review + business verification required for pages_manage_posts before any page can publish through the api.",
};

// pkce is unused by facebook's login dialog; the shared oauth route handles it
// generically for adapters that declare authType oauth2_pkce.

export const facebookRedirectPath = `/api/oauth/facebook/callback`;
