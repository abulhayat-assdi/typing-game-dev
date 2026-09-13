import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import { createMemoryShopStore } from "../../../lib/server/shop-store";
import {
  handleEquip,
  handleGetClanInventory,
  handleGetInventory,
  handleGetItem,
  handleListItems,
  handlePurchase,
  handleUse,
} from "./_helper";
import {
  handleCreateItem,
  handleListCatalog,
  handleShopAction,
} from "../admin/shop/_helper";

const ITEM_A = "00000000-0000-4000-8000-000000000001";
const ITEM_B = "00000000-0000-4000-8000-000000000002";
const ITEM_C = "00000000-0000-4000-8000-000000000003";
const CLAN = "11111111-0000-4000-8000-000000000001";

const admin: Actor = {
  userId: "a-1",
  email: "a@example.com",
  roles: ["admin"],
  adminOrgIds: [],
  status: "active",
};

const student: Actor = {
  userId: "s-1",
  email: "s@example.com",
  roles: ["student"],
  adminOrgIds: [],
  status: "active",
};

const session = { userId: "u-1", email: "u@example.com" };

function summary(
  id: string,
  slug: string,
  patch: Record<string, number | boolean | string> = {},
) {
  return {
    id,
    slug,
    name: slug,
    description: "",
    category: "avatar_frames",
    itemType: "cosmetic",
    previewKey: null,
    assetKey: null,
    priceCoins: 100,
    isActive: true,
    isFeatured: false,
    availableFrom: null,
    availableTo: null,
    maxOwn: 1,
    consumable: false,
    equippable: true,
    effect: null,
    ...patch,
  };
}

function seed() {
  return createMemoryShopStore({
    coins: 250,
    staffClans: [CLAN],
    items: [
      summary(ITEM_A, "gold-frame"),
      summary(ITEM_B, "one-only", { priceCoins: 10, purchaseLimitTotal: 1 }),
      summary(ITEM_C, "war-banner", {
        category: "clan_banners",
        itemType: "clan_cosmetic",
        priceCoins: 200,
      }),
    ],
  });
}

describe("student shop endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    const store = seed();
    expect((await handleListItems({ session: null, store })).status).toBe(401);
    expect((await handleListItems({ session, store: null })).status).toBe(503);
  });

  it("404s opaque ids", async () => {
    const deps = { session, store: seed() };
    expect((await handleGetItem("nope", deps)).status).toBe(404);
    expect((await handlePurchase("nope", { requestId: "r1" }, deps)).status).toBe(404);
    expect(
      (await handleGetClanInventory("nope", deps)).status,
    ).toBe(404);
  });

  it("lists active items with ownership", async () => {
    const store = seed();
    const deps = { session, store };
    const list = await handleListItems(deps);
    expect(await list.json()).toMatchObject({
      items: [{ slug: "gold-frame" }, { slug: "one-only" }, { slug: "war-banner" }],
    });
    const detail = await handleGetItem(ITEM_A, deps);
    expect(await detail.json()).toMatchObject({
      item: { slug: "gold-frame", ownedQuantity: 0, equipped: false },
    });
  });

  it("purchases atomically and replays idempotently", async () => {
    const store = seed();
    const deps = { session, store };
    const first = await handlePurchase(ITEM_A, { requestId: "req-1" }, deps);
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as { purchaseId: string };
    expect(store.__coins.balance).toBe(150);
    const replay = await handlePurchase(ITEM_A, { requestId: "req-1" }, deps);
    expect(await replay.json()).toMatchObject({
      ok: true,
      purchaseId: firstJson.purchaseId,
    });
    expect(store.__coins.balance).toBe(150);
    const inv = (await (await handleGetInventory(deps)).json()) as {
      items: { slug: string; quantity: number }[];
    };
    expect(inv.items).toMatchObject([{ slug: "gold-frame", quantity: 1 }]);
  });

  it("enforces limits and balances server-side", async () => {
    const store = seed();
    const deps = { session, store };
    expect((await handlePurchase(ITEM_B, { requestId: "a" }, deps)).status).toBe(200);
    const limited = await handlePurchase(ITEM_B, { requestId: "b" }, deps);
    expect(limited.status).toBe(409);
    expect(await limited.json()).toMatchObject({ error: "LIMIT" });
    // Forged price in the body is ignored: catalog price still debits.
    const forged = await handlePurchase(
      ITEM_A,
      { requestId: "c", priceCoins: 1, currency: "gems" },
      deps,
    );
    expect(forged.status).toBe(200);
    expect(store.__coins.balance).toBe(250 - 10 - 100);
    const poor = createMemoryShopStore({
      coins: 5,
      items: [summary(ITEM_A, "gold-frame")],
    });
    const denied = await handlePurchase(
      ITEM_A,
      { requestId: "x" },
      { session, store: poor },
    );
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({ error: "INSUFFICIENT" });
  });

  it("rejects malformed purchase bodies", async () => {
    const deps = { session, store: seed() };
    expect((await handlePurchase(ITEM_A, {}, deps)).status).toBe(400);
    expect((await handlePurchase(ITEM_A, { requestId: "" }, deps)).status).toBe(400);
    expect(
      (await handlePurchase(ITEM_A, { requestId: "r", clanId: "bad" }, deps)).status,
    ).toBe(400);
  });

  it("equips owned items and consumes charges", async () => {
    const store = createMemoryShopStore({
      coins: 500,
      items: [
        summary(ITEM_A, "gold-frame"),
        {
          ...summary(ITEM_B, "retry", {
            category: "utility",
            itemType: "utility",
          }),
          priceCoins: 10,
          maxOwn: 3,
          consumable: true,
          equippable: false,
        },
      ],
    });
    const deps = { session, store };
    expect((await handleEquip({ itemId: ITEM_A }, deps)).status).toBe(404);
    await handlePurchase(ITEM_A, { requestId: "e1" }, deps);
    expect((await handleEquip({ itemId: ITEM_A }, deps)).status).toBe(200);
    expect((await handleEquip({ itemId: ITEM_A, equip: false }, deps)).status).toBe(200);
    await handlePurchase(ITEM_B, { requestId: "e2" }, deps);
    const used = await handleUse({ itemId: ITEM_B }, deps);
    expect(await used.json()).toMatchObject({ ok: true, remaining: 0 });
    expect((await handleUse({ itemId: "nope-not-uuid" }, deps)).status).toBe(400);
  });

  it("gates clan cosmetics by staff", async () => {
    const store = seed();
    const deps = { session, store };
    const personal = await handlePurchase(ITEM_C, { requestId: "p1" }, deps);
    expect(personal.status).toBe(409);
    const clan = await handlePurchase(
      ITEM_C,
      { requestId: "p2", clanId: CLAN },
      deps,
    );
    expect(clan.status).toBe(200);
    const noStaff = createMemoryShopStore({
      coins: 500,
      items: [summary(ITEM_C, "war-banner", { category: "clan_banners", itemType: "clan_cosmetic", priceCoins: 200 })],
    });
    const denied = await handlePurchase(
      ITEM_C,
      { requestId: "p3", clanId: CLAN },
      { session, store: noStaff },
    );
    expect(denied.status).toBe(403);
    const board = await handleGetClanInventory(CLAN, deps);
    expect(await board.json()).toMatchObject({
      items: [{ slug: "war-banner", quantity: 1 }],
    });
  });
});

describe("admin shop endpoints", () => {
  it("rejects non-admins with 403", async () => {
    const store = seed();
    const deps = { actor: student, store };
    expect((await handleListCatalog(deps)).status).toBe(403);
    expect(
      (
        await handleCreateItem(
          { slug: "x", name: "X", category: "titles", itemType: "profile", priceCoins: 1 },
          deps,
        )
      ).status,
    ).toBe(403);
    expect(
      (await handleShopAction(ITEM_A, "activate", {}, deps)).status,
    ).toBe(403);
  });

  it("validates creation bodies and manages lifecycle", async () => {
    const store = seed();
    const deps = { actor: admin, store };
    expect((await handleCreateItem({}, deps)).status).toBe(400);
    expect(
      (
        await handleCreateItem(
          { slug: "BAD", name: "X", category: "titles", itemType: "profile", priceCoins: 1 },
          deps,
        )
      ).status,
    ).toBe(400);
    const created = await handleCreateItem(
      { slug: "new-cap", name: "New Cap", category: "titles", itemType: "profile", priceCoins: 25 },
      deps,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await handleShopAction("nope", "activate", {}, deps)).status).toBe(404);
    expect((await handleShopAction(id, "activate", {}, deps)).status).toBe(200);
    expect((await handleShopAction(id, "update", { name: "X" }, deps)).status).toBe(409);
    expect((await handleShopAction(id, "deactivate", {}, deps)).status).toBe(200);
    expect((await handleShopAction(id, "update", { name: "Newer" }, deps)).status).toBe(200);
  });
});
