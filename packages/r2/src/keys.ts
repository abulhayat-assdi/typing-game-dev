/**
 * R2 object-key layer (M3). Pure string logic — no SDK, no secrets, no I/O —
 * so it runs identically in Workers, Node, and tests.
 *
 * Conventions (see docs/r2.md):
 *   avatars/{userId}/{original|thumb}.{img}
 *   badges/{badgeSlug}/icon.{img}
 *   worlds/{worldSlug}/{background|map|intro}.{img}
 *   games/{gameSlug}/{preview|art}.{img}
 *   sound/{pack}/{file}.{audio}            (short game sounds)
 *   audio/{pack}/{file}.{audio}            (music / narration)
 *   ui/{surface}/{asset}.{img}
 *   competition/{competitionId}/{asset}.{img}
 *   cosmetics/{cosmeticId}/asset.{img}
 *   promo/{campaign}/{asset}.{img}
 *
 * Security: every key entering or leaving the system passes parseR2Key(),
 * which rejects traversal, unknown prefixes, bad extensions and control
 * characters. The signed-URL route additionally restricts signing to
 * SIGNABLE_PREFIXES (private assets only).
 */

export const R2_PREFIXES = [
  "avatars",
  "badges",
  "worlds",
  "games",
  "sound",
  "audio",
  "ui",
  "competition",
  "cosmetics",
  "promo",
] as const;
export type R2Prefix = (typeof R2_PREFIXES)[number];

const IMAGE_EXTS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "svg",
]);
const AUDIO_EXTS: ReadonlySet<string> = new Set([
  "mp3",
  "ogg",
  "wav",
  "webm",
  "m4a",
]);

const PREFIX_EXTS: Record<R2Prefix, ReadonlySet<string>> = {
  avatars: IMAGE_EXTS,
  badges: IMAGE_EXTS,
  worlds: IMAGE_EXTS,
  games: IMAGE_EXTS,
  sound: AUDIO_EXTS,
  audio: AUDIO_EXTS,
  ui: IMAGE_EXTS,
  competition: IMAGE_EXTS,
  cosmetics: IMAGE_EXTS,
  promo: IMAGE_EXTS,
};

export const MAX_KEY_LENGTH = 512;
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class R2KeyError extends Error {
  readonly code = "INVALID_R2_KEY" as const;
  constructor(reason: string) {
    super(`Invalid R2 object key: ${reason}`);
  }
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

/**
 * Validate + normalize a candidate key. Throws R2KeyError on:
 * non-strings, length violations, leading slashes, backslashes, null bytes
 * or control characters, `..` segments, empty/doubled segments, absolute
 * URLs, unknown prefixes, bad per-segment charset, disallowed extensions.
 */
export function parseR2Key(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new R2KeyError("key must be a non-empty string");
  }
  const key = input;
  if (key.length > MAX_KEY_LENGTH) {
    throw new R2KeyError(`key exceeds ${String(MAX_KEY_LENGTH)} characters`);
  }
  if (
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001F\u007F]/.test(key) ||
    /\s/.test(key)
  ) {
    throw new R2KeyError("key contains illegal characters");
  }
  if (key.includes("://")) {
    throw new R2KeyError("absolute URLs are not object keys");
  }
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new R2KeyError("key contains empty or traversal segments");
  }
  const [prefix, ...rest] = segments as [string, ...string[]];
  if (!(R2_PREFIXES as readonly string[]).includes(prefix)) {
    throw new R2KeyError(`unknown prefix "${prefix}"`);
  }
  if (rest.length === 0) {
    throw new R2KeyError("key must name an object below its prefix");
  }
  for (const seg of rest) {
    if (!SEGMENT_RE.test(seg)) {
      throw new R2KeyError(`illegal segment "${seg}"`);
    }
  }
  const allowed = PREFIX_EXTS[prefix as R2Prefix];
  const ext = extOf(segments[segments.length - 1] as string);
  if (!allowed.has(ext)) {
    throw new R2KeyError(
      `extension ".${ext}" not allowed under "${prefix}"`,
    );
  }
  return key;
}

/** Non-throwing companion for form-level checks. */
export function isValidR2Key(input: unknown): boolean {
  try {
    parseR2Key(input);
    return true;
  } catch {
    return false;
  }
}

function seg(value: string, what: string): string {
  if (!SEGMENT_RE.test(value) || value === "." || value === "..") {
    throw new R2KeyError(`illegal ${what} "${value}"`);
  }
  return value;
}

function file(name: string, allowed: ReadonlySet<string>, what: string): string {
  const clean = seg(name, what);
  const ext = extOf(clean);
  if (!allowed.has(ext) || clean.endsWith(".")) {
    throw new R2KeyError(`illegal ${what} "${name}"`);
  }
  return clean;
}

export type AvatarVariant = "original" | "thumb";
export function avatarKey(
  userId: string,
  variant: AvatarVariant,
  ext: string,
): string {
  const e = ext.toLowerCase();
  if (!IMAGE_EXTS.has(e)) throw new R2KeyError(`illegal avatar extension "${ext}"`);
  return `avatars/${seg(userId, "user id")}/${variant}.${e}`;
}

export function badgeKey(badgeSlug: string, ext = "webp"): string {
  const e = ext.toLowerCase();
  if (!IMAGE_EXTS.has(e)) throw new R2KeyError(`illegal badge extension "${ext}"`);
  return `badges/${seg(badgeSlug, "badge slug")}/icon.${e}`;
}

export type WorldAsset = "background" | "map" | "intro";
export function worldKey(worldSlug: string, asset: WorldAsset, ext = "webp"): string {
  const e = ext.toLowerCase();
  if (!IMAGE_EXTS.has(e)) throw new R2KeyError(`illegal world extension "${ext}"`);
  return `worlds/${seg(worldSlug, "world slug")}/${asset}.${e}`;
}

export type GameAsset = "preview" | "art";
export function gameKey(gameSlug: string, asset: GameAsset, ext = "webp"): string {
  const e = ext.toLowerCase();
  if (!IMAGE_EXTS.has(e)) throw new R2KeyError(`illegal game extension "${ext}"`);
  return `games/${seg(gameSlug, "game slug")}/${asset}.${e}`;
}

export function soundKey(pack: string, filename: string): string {
  return `sound/${seg(pack, "sound pack")}/${file(filename, AUDIO_EXTS, "sound file")}`;
}

export function audioKey(pack: string, filename: string): string {
  return `audio/${seg(pack, "audio pack")}/${file(filename, AUDIO_EXTS, "audio file")}`;
}

export function uiKey(surface: string, filename: string): string {
  return `ui/${seg(surface, "ui surface")}/${file(filename, IMAGE_EXTS, "ui asset")}`;
}

export function competitionKey(competitionId: string, filename: string): string {
  return `competition/${seg(competitionId, "competition id")}/${file(filename, IMAGE_EXTS, "competition asset")}`;
}

export function cosmeticKey(cosmeticId: string, ext = "webp"): string {
  const e = ext.toLowerCase();
  if (!IMAGE_EXTS.has(e)) throw new R2KeyError(`illegal cosmetic extension "${ext}"`);
  return `cosmetics/${seg(cosmeticId, "cosmetic id")}/asset.${e}`;
}

export function promoKey(campaign: string, filename: string): string {
  return `promo/${seg(campaign, "campaign")}/${file(filename, IMAGE_EXTS, "promo asset")}`;
}
