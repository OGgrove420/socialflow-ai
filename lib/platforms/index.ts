// platform registry. add a platform by implementing PlatformAdapter in its own
// file and registering it here. no adapter imports another adapter.
import type { PlatformId, PlatformAdapter } from "./types";
import { facebookAdapter } from "./facebook";
import { instagramAdapter } from "./instagram";
import { linkedinAdapter, linkedinPageAdapter } from "./linkedin";
import { tiktokAdapter } from "./tiktok";
import { xAdapter } from "./x";
import { youtubeAdapter } from "./youtube";
import { pinterestAdapter } from "./pinterest";

export const registry: Record<PlatformId, PlatformAdapter> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  linkedin: linkedinAdapter,
  linkedin_page: linkedinPageAdapter,
  tiktok: tiktokAdapter,
  x: xAdapter,
  youtube: youtubeAdapter,
  pinterest: pinterestAdapter,
};

export function getAdapter(platform: string): PlatformAdapter | null {
  return (registry as Record<string, PlatformAdapter | undefined>)[platform] ?? null;
}

export function allAdapters(): PlatformAdapter[] {
  return Object.values(registry);
}

export type { PlatformAdapter, PlatformId, Capabilities } from "./types";
