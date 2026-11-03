// linkedin adapter — oauth2 with pkce. one adapter handles both variants:
// "linkedin" posts to the member's personal profile (w_member_social),
// "linkedin_page" posts to a company page they administer
// (w_organization_social, requires the community management product).
import {
  hasEnv, postForm, redirectUriFor, requireEnv,
  type ExchangeResult, type PlatformAdapter, type PublishInput, type PublishOutput,
} from "./types";

const AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const UGC = "https://api.linkedin.com/v2/ugcPosts";
const SCOPES = ["openid", "profile", "w_member_social"];
const SCOPES_PAGE = ["openid", "profile", "w_member_social", "w_organization_social"];

type LinkedinKind = "person" | "organization";

function creds(platform: string) {
  return {
    id: requireEnv("SF_LINKEDIN_CLIENT_ID"),
    secret: requireEnv("SF_LINKEDIN_CLIENT_SECRET"),
  };
}

function makeAdapter(id: "linkedin" | "linkedin_page", name: string): PlatformAdapter {
  const isPage = id === "linkedin_page";
  return {
    id,
    name,
    authType: "oauth2_pkce",
    clientEnvId: "SF_LINKEDIN_CLIENT_ID",
    clientEnvSecret: "SF_LINKEDIN_CLIENT_SECRET",
    credentialsConfigured: () =>
      hasEnv("SF_LINKEDIN_CLIENT_ID") && hasEnv("SF_LINKEDIN_CLIENT_SECRET"),

    authorizeUrl({ state, codeChallenge }) {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: process.env.SF_LINKEDIN_CLIENT_ID ?? "",
        redirect_uri: redirectUriFor(id),
        state,
        scope: (isPage ? SCOPES_PAGE : SCOPES).join(" "),
      });
      if (codeChallenge) {
        params.set("code_challenge", codeChallenge);
        params.set("code_challenge_method", "S256");
      }
      return `${AUTHORIZE}?${params}`;
    },

    async exchangeCode(code, redirectUri, codeVerifier) {
      const { id: clientId, secret } = creds(id);
      const params: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: secret,
      };
      if (codeVerifier) params.code_verifier = codeVerifier;
      const data = await postForm(TOKEN, params);
      const accessToken = String(data.access_token ?? "");
      if (!accessToken) throw new Error("no access_token in linkedin response");
      const expiresIn = data.expires_in ? Number(data.expires_in) : null;
      const refreshToken = data.refresh_token ? String(data.refresh_token) : null;

      // who am i (openidconnect userinfo)
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const me = (await meRes.json().catch(() => ({}))) as {
        sub?: string; name?: string; email?: string; picture?: string;
      };

      let platformUserId = me.sub ?? "unknown";
      let accountName = me.name ?? "LinkedIn account";
      const meta: Record<string, unknown> = { kind: (isPage ? "organization" : "person") as LinkedinKind };

      if (isPage) {
        // organization page(s) this member administers
        const orgRes = await fetch(
          "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(*,organizationalTarget~(localizedName,vanityName,logoV2)))",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const orgs = (await orgRes.json().catch(() => ({}))) as {
          elements?: {
            organizationalTarget?: string;
            "organizationalTarget~"?: {
              localizedName?: string; vanityName?: string;
              logoV2?: { original?: string };
            };
          }[];
        };
        const first = orgs.elements?.[0];
        if (first?.organizationalTarget) {
          platformUserId = first.organizationalTarget.replace("urn:li:organization:", "");
          accountName = first["organizationalTarget~"]?.localizedName ?? accountName;
          meta.logoUrl = first["organizationalTarget~"]?.logoV2?.original ?? null;
        } else {
          meta.warning = "no company page admin roles found on this member";
        }
      }

      return {
        accessToken,
        refreshToken,
        expiresIn,
        scopes: isPage ? SCOPES_PAGE : SCOPES,
        platformUserId,
        accountName,
        avatarUrl: me.picture ?? null,
        meta,
      };
    },

    capabilities: {
      text: true,
      image: true,
      video: false, // member posting: no video via ugcPosts; org video needs direct upload product
      reels: false,
      stories: false,
      carousel: false,
      schedule: false,
      analytics: true,
      comments: true,
      maxCaption: 3000,
      notes: isPage
        ? [
            "company page posting requires the community management product approved on your linkedin app",
            "images need the two-step registerUpload + ugcPosts flow",
          ]
        : [
            "personal profile posts: text and single image via ugcPosts",
            "articles/other types are not covered by this adapter",
          ],
    },

    async publish(account, accessToken, input: PublishInput): Promise<PublishOutput> {
      const kind = (account.meta.kind as LinkedinKind) ?? (id === "linkedin_page" ? "organization" : "person");
      const authorUrn =
        kind === "organization"
          ? `urn:li:organization:${account.platformUserId}`
          : `urn:li:person:${account.platformUserId}`;
      const warnings: string[] = [];
      const [image] = input.mediaUrls.filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u));

      // two-step image upload when an image is attached
      let mediaUrn: string | null = null;
      if (image) {
        const registerRes = await fetch(
          "https://api.linkedin.com/rest/assets?action=registerUpload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0",
              "LinkedIn-Version": "202501",
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
                owner: authorUrn,
                serviceRelationships: [
                  { relationshipType: "urn:li:digitalmediaRelationship:networkShare" },
                ],
              },
            }),
          },
        );
        const reg = (await registerRes.json().catch(() => ({}))) as {
          value?: {
            asset?: string;
            uploadMechanism?: {
              "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
                uploadUrl?: string;
              };
            };
          };
        };
        const uploadUrl = reg.value?.uploadMechanism?.[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ]?.uploadUrl;
        if (!registerRes.ok || !uploadUrl || !reg.value?.asset) {
          throw Object.assign(
            new Error("linkedin image registerUpload failed (needs image upload product approval)"),
            { status: registerRes.status, stage: "li-register" },
          );
        }
        const imgData = Buffer.from(
          await (await fetch(image)).arrayBuffer(),
        );
        const putRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/octet-stream" },
          body: new Uint8Array(imgData),
        });
        if (!putRes.ok) {
          throw Object.assign(new Error("linkedin image upload failed"), {
            status: putRes.status, stage: "li-upload",
          });
        }
        mediaUrn = reg.value.asset;
        warnings.push("image uploaded through the registerUpload flow");
      }

      const body: Record<string, unknown> = {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: input.caption.slice(0, 3000) },
            shareMediaCategory: mediaUrn ? "IMAGE" : "NONE",
            ...(mediaUrn
              ? {
                  media: [
                    {
                      status: "READY",
                      media: mediaUrn,
                      title: { text: "" },
                    },
                  ],
                }
              : {}),
          },
        },
        visibility:
          kind === "organization"
            ? { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
            : { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };
      const postRes = await fetch(UGC, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(body),
      });
      const postText = await postRes.text();
      if (!postRes.ok) {
        throw Object.assign(
          new Error(`linkedin ugcPosts failed: ${postText.slice(0, 200)}`),
          { status: postRes.status, stage: "li-post" },
        );
      }
      let remoteId: string | null = null;
      try {
        const parsed = JSON.parse(postText) as { id?: string };
        remoteId = parsed.id ?? null;
      } catch { /* activity id header fallback */ }
      return {
        remoteId,
        remoteUrl: null,
        warnings: [...warnings, "linkedin api has no scheduled personal posting"],
      };
    },

    fallbackNote:
      "linkedin has no member-level scheduled posting via api: at the chosen time you get the caption ready to paste into linkedin.",

    reviewRequired: true,
    reviewNote: isPage
      ? "requires the community management access product (company page posting) added and approved on your linkedin app"
      : "requires the share on linkedin product added on your linkedin app; basic posting is usually auto-granted after the app exists",
  };
}

export const linkedinAdapter = makeAdapter("linkedin", "LinkedIn Profile");
export const linkedinPageAdapter = makeAdapter("linkedin_page", "LinkedIn Company Page");
