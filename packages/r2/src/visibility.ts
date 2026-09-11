/**
 * Asset visibility + URL mapping (M3).
 *
 * PUBLIC prefixes are served straight from the R2 public bucket/CDN base URL
 * (cache-friendly, no signing). PRIVATE prefixes are served ONLY through the
 * signed-URL route, which additionally restricts signing to SIGNABLE_PREFIXES
 * so clients can never pull arbitrary objects.
 */
import { parseR2Key, type R2Prefix } from "./keys";

export type AssetVisibility = "public" | "private";

export const ASSET_VISIBILITY: Record<R2Prefix, AssetVisibility> = {
  avatars: "private",
  badges: "public",
  worlds: "public",
  games: "public",
  sound: "public",
  audio: "public",
  ui: "public",
  competition: "public",
  cosmetics: "public",
  promo: "public",
};

/** Prefixes the signed-URL route will sign (private assets only). */
export const SIGNABLE_PREFIXES: ReadonlySet<R2Prefix> = new Set<R2Prefix>(
  (Object.keys(ASSET_VISIBILITY) as R2Prefix[]).filter(
    (p) => ASSET_VISIBILITY[p] === "private",
  ),
);

export function visibilityOf(key: string): AssetVisibility {
  const valid = parseR2Key(key);
  const prefix = valid.split("/")[0] as R2Prefix;
  return ASSET_VISIBILITY[prefix];
}

export function isSignable(key: string): boolean {
  try {
    const valid = parseR2Key(key);
    return SIGNABLE_PREFIXES.has(valid.split("/")[0] as R2Prefix);
  } catch {
    return false;
  }
}

/** Public CDN URL for a PUBLIC key. Throws for private keys (use signing). */
export function publicUrlFor(key: string, baseUrl: string): string {
  const visibility = visibilityOf(key);
  if (visibility !== "public") {
    throw new Error(`Refusing public URL for private asset "${key}"`);
  }
  const base = baseUrl.replace(/\/+$/, "");
  if (base.length === 0) throw new Error("Missing R2 public base URL");
  return `${base}/${key}`;
}
