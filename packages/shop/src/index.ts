/**
 * @tap/shop - clan shop domain (M16). Pure TypeScript + @tap/r2 key
 * validation (no UI/DB imports). The coin ledger stays the only
 * currency authority; this package validates catalog shapes,
 * idempotency keys, purchase limits, and equip rules. The database
 * re-validates everything on write.
 */

export type ShopItemType = "cosmetic" | "profile" | "clan_cosmetic" | "utility";

export type ShopEffect =
  | "retry_credit"
  | "streak_shield"
  | "combo_flair"
  | null;

export interface ShopItemInput {
  slug: string;
  name: string;
  category: string;
  itemType: ShopItemType;
  assetKey?: string | null;
  previewKey?: string | null;
  priceCoins: number;
  availableFrom?: string | null;
  availableTo?: string | null;
  purchaseLimitTotal?: number | null;
  purchaseLimitDaily?: number | null;
  purchaseLimitWeekly?: number | null;
  maxOwn?: number | null;
  consumable?: boolean;
  equippable?: boolean;
  effect?: ShopEffect;
  featured?: boolean;
}

export const SHOP_CATEGORIES = [
  "avatar_frames",
  "profile_effects",
  "titles",
  "badge_variants",
  "clan_banners",
  "clan_emblems",
  "map_effects",
  "victory_animations",
  "result_effects",
  "sound_packs",
  "utility",
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Categories restricted to clan-owned items (and vice versa). */
export function categoryForType(itemType: ShopItemType): readonly string[] {
  if (itemType === "clan_cosmetic") return ["clan_banners", "clan_emblems"];
  return SHOP_CATEGORIES.filter(
    (c) => c !== "clan_banners" && c !== "clan_emblems",
  );
}

/** Equip slots: one equipped item per slot per scope. */
export function equipSlot(
  category: string,
): "frame" | "title" | "effect" | "banner" | "emblem" | "other" {
  if (category === "avatar_frames") return "frame";
  if (category === "titles") return "title";
  if (
    category === "profile_effects" ||
    category === "map_effects" ||
    category === "victory_animations" ||
    category === "result_effects" ||
    category === "sound_packs" ||
    category === "badge_variants"
  ) {
    return "effect";
  }
  if (category === "clan_banners") return "banner";
  if (category === "clan_emblems") return "emblem";
  return "other";
}

export function validateShopItem(
  def: Omit<ShopItemInput, "itemType" | "effect"> & {
    itemType: string;
    effect?: string | null;
  },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!SLUG.test(def.slug)) errors.push("MALFORMED_SLUG");
  if (!def.name || def.name.length > 160) errors.push("MALFORMED_NAME");
  if (
    def.itemType !== "cosmetic" &&
    def.itemType !== "profile" &&
    def.itemType !== "clan_cosmetic" &&
    def.itemType !== "utility"
  ) {
    errors.push("UNSUPPORTED_ITEM_TYPE");
  }
  const inCatalog = (SHOP_CATEGORIES as readonly string[]).includes(
    def.category,
  );
  const scope: ShopItemType =
    def.itemType === "clan_cosmetic" ? "clan_cosmetic" : "cosmetic";
  if (!inCatalog || !categoryForType(scope).includes(def.category)) {
    errors.push("CATEGORY_MISMATCH");
  }
  if (!Number.isInteger(def.priceCoins) || def.priceCoins < 0) {
    errors.push("INVALID_PRICE");
  }
  const from = def.availableFrom == null ? NaN : Date.parse(def.availableFrom);
  const to = def.availableTo == null ? NaN : Date.parse(def.availableTo);
  if (
    (def.availableFrom != null && !Number.isFinite(from)) ||
    (def.availableTo != null && !Number.isFinite(to))
  ) {
    errors.push("INVALID_AVAILABILITY");
  } else if (Number.isFinite(from) && Number.isFinite(to) && to <= from) {
    errors.push("INVALID_AVAILABILITY");
  }
  for (const [key, v] of [
    ["purchaseLimitTotal", def.purchaseLimitTotal],
    ["purchaseLimitDaily", def.purchaseLimitDaily],
    ["purchaseLimitWeekly", def.purchaseLimitWeekly],
    ["maxOwn", def.maxOwn],
  ] as const) {
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1)) {
      errors.push(`INVALID_${key.toUpperCase()}`);
    }
  }
  // Utility economy rails: bounded stacks, documented effects only.
  if (def.itemType === "utility") {
    if (def.maxOwn !== undefined && def.maxOwn !== null && def.maxOwn > 5) {
      errors.push("UTILITY_STACK_TOO_LARGE");
    }
    const effect = def.effect ?? null;
    if (
      effect !== null &&
      effect !== "retry_credit" &&
      effect !== "streak_shield" &&
      effect !== "combo_flair"
    ) {
      errors.push("UNSUPPORTED_EFFECT");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Deterministic idempotency key. Same (item, user, clan, request) ⇒
 * same key, so double-clicks/retries/replays collapse to one debit.
 */
export function purchaseKey(
  itemId: string,
  userId: string,
  requestId: string,
  clanId?: string | null,
): string {
  const scope = clanId ? `:clan:${clanId}` : "";
  return `shop:${itemId}:user:${userId}${scope}:purchase:${requestId}`;
}

/** Availability check against an optional window (null = unbounded). */
export function isAvailable(
  nowMs: number,
  from: string | null,
  to: string | null,
): boolean {
  const f = from == null ? Number.NaN : Date.parse(from);
  const t = to == null ? Number.NaN : Date.parse(to);
  if (Number.isFinite(f) && nowMs < f) return false;
  if (Number.isFinite(t) && nowMs >= t) return false;
  return true;
}
