/**
 * M16 shop domain tests: catalog validation, equip slots, idempotency
 * keys, availability. DB-level purchase/inventory cases live in
 * supabase/tests/m16_shop_test.sql.
 */
import { describe, expect, it } from "vitest";
import { parseR2Key } from "@tap/r2";
import {
  categoryForType,
  equipSlot,
  isAvailable,
  purchaseKey,
  validateShopItem,
} from "./index";

describe("validateShopItem", () => {
  const base = {
    slug: "gold-frame",
    name: "Gold Frame",
    category: "avatar_frames",
    itemType: "cosmetic" as const,
    priceCoins: 100,
  };
  it("accepts a valid cosmetic", () => {
    expect(validateShopItem(base).ok).toBe(true);
  });
  it("rejects malformed definitions", () => {
    const r = validateShopItem({
      ...base,
      slug: "BAD",
      name: "",
      priceCoins: -5,
      availableFrom: "2026-12-01T00:00:00Z",
      availableTo: "2026-10-01T00:00:00Z",
    });
    expect(r.errors).toContain("MALFORMED_SLUG");
    expect(r.errors).toContain("MALFORMED_NAME");
    expect(r.errors).toContain("INVALID_PRICE");
    expect(r.errors).toContain("INVALID_AVAILABILITY");
  });
  it("keeps clan categories clan-only", () => {
    expect(
      validateShopItem({ ...base, category: "clan_banners" }).errors,
    ).toContain("CATEGORY_MISMATCH");
    expect(
      validateShopItem({
        ...base,
        category: "clan_banners",
        itemType: "clan_cosmetic",
      }).ok,
    ).toBe(true);
    expect(categoryForType("clan_cosmetic")).toEqual([
      "clan_banners",
      "clan_emblems",
    ]);
  });
  it("rails utility stacks and effects", () => {
    expect(
      validateShopItem({
        ...base,
        category: "utility",
        itemType: "utility",
        maxOwn: 99,
      }).errors,
    ).toContain("UTILITY_STACK_TOO_LARGE");
    expect(
      validateShopItem({
        ...base,
        category: "utility",
        itemType: "utility",
        maxOwn: 3,
        effect: "retry_credit",
      }).ok,
    ).toBe(true);
  });
});

describe("equip slots", () => {
  it("maps one slot per category family", () => {
    expect(equipSlot("avatar_frames")).toBe("frame");
    expect(equipSlot("titles")).toBe("title");
    expect(equipSlot("clan_banners")).toBe("banner");
    expect(equipSlot("clan_emblems")).toBe("emblem");
    expect(equipSlot("sound_packs")).toBe("effect");
    expect(equipSlot("utility")).toBe("other");
  });
});

describe("purchase keys and availability", () => {
  it("builds deterministic idempotency keys", () => {
    const a = purchaseKey("item-1", "user-1", "req-1");
    expect(a).toBe(purchaseKey("item-1", "user-1", "req-1"));
    expect(a).toBe("shop:item-1:user:user-1:purchase:req-1");
    expect(purchaseKey("item-1", "user-1", "req-1", "clan-1")).toBe(
      "shop:item-1:user:user-1:clan:clan-1:purchase:req-1",
    );
    expect(purchaseKey("item-1", "user-1", "req-2")).not.toBe(a);
  });
  it("honors availability windows", () => {
    const now = Date.parse("2026-06-01T00:00:00Z");
    expect(isAvailable(now, null, null)).toBe(true);
    expect(
      isAvailable(now, "2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"),
    ).toBe(true);
    expect(isAvailable(now, "2026-07-01T00:00:00Z", null)).toBe(false);
    expect(isAvailable(now, null, "2026-05-01T00:00:00Z")).toBe(false);
  });
  it("accepts cosmetics/ R2 keys through the shared parser", () => {
    expect(parseR2Key("cosmetics/gold-frame/preview.png")).toBe(
      "cosmetics/gold-frame/preview.png",
    );
    expect(() => parseR2Key("../escape.png")).toThrow();
  });
});
