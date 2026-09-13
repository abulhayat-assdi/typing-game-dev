/**
 * Shop persistence boundary (M16). Routes depend ONLY on ShopStore —
 * never on SQL or the Supabase client directly — so shop/API tests run
 * offline against the memory implementation while production uses
 * PostgREST RPCs (SECURITY DEFINER fns from 0034, RLS reads).
 *
 * Enforcement lives in the database (fn price/limit/ownership checks,
 * locked M5 coin debit, idempotency keys). The store maps DB errors to
 * typed errors; routes map those to HTTP codes. The shop only consumes
 * coins — no mint, transfer, or cash-out path exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message = "CONFLICT") {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface ShopItemSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  itemType: string;
  previewKey: string | null;
  assetKey: string | null;
  priceCoins: number;
  isActive: boolean;
  isFeatured: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  maxOwn: number;
  consumable: boolean;
  equippable: boolean;
  effect: string | null;
}

export interface ShopItemDetail extends ShopItemSummary {
  ownedQuantity: number;
  equipped: boolean;
}

export interface InventoryEntry {
  itemId: string;
  slug: string;
  name: string;
  category: string;
  itemType: string;
  quantity: number;
  equipped: boolean;
  expiresAt: string | null;
  previewKey: string | null;
  consumable: boolean;
  equippable: boolean;
  effect: string | null;
}

export interface ShopItemCreateInput {
  slug: string;
  name: string;
  description: string;
  category: string;
  itemType: string;
  assetKey: string | null;
  previewKey: string | null;
  priceCoins: number;
  featured: boolean;
}

export interface ShopStore {
  listItems(): Promise<ShopItemSummary[]>;
  getItem(id: string): Promise<ShopItemDetail | null>;
  purchaseItem(id: string, requestId: string, clanId?: string): Promise<string>;
  getInventory(): Promise<InventoryEntry[]>;
  getClanInventory(clanId: string): Promise<InventoryEntry[]>;
  equipItem(id: string, equip: boolean, clanId?: string): Promise<void>;
  useItem(id: string, context?: Record<string, unknown>): Promise<number>;
  createItem(input: ShopItemCreateInput): Promise<string>;
  updateItem(id: string, patch: Record<string, unknown>): Promise<void>;
  setItemActive(id: string, active: boolean): Promise<void>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function optStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

export function mapStoreError(e: unknown): Error {
  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|row-level security|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND/i.test(message)) return new NotFoundError(message);
  if (
    /duplicate|unique|already|ALREADY|INVALID|MALFORMED|INACTIVE|UNAVAILABLE|LIMIT|INSUFFICIENT|IMMUTABLE|DRAFT/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

const ITEM_COLUMNS =
  "id, slug, name, description, category, item_type, preview_key, asset_key, price_coins, is_active, is_featured, available_from, available_to, max_own, consumable, equippable, effect";

function toSummary(t: Record<string, unknown>): ShopItemSummary | null {
  if (typeof t.id !== "string") return null;
  return {
    id: t.id,
    slug: str(t.slug),
    name: str(t.name),
    description: str(t.description),
    category: str(t.category),
    itemType: str(t.item_type),
    previewKey: optStr(t.preview_key),
    assetKey: optStr(t.asset_key),
    priceCoins: num(t.price_coins),
    isActive: bool(t.is_active),
    isFeatured: bool(t.is_featured),
    availableFrom: optStr(t.available_from),
    availableTo: optStr(t.available_to),
    maxOwn: num(t.max_own, 1),
    consumable: bool(t.consumable),
    equippable: bool(t.equippable),
    effect: optStr(t.effect),
  };
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseShopStore(client: SupabaseClient): ShopStore {
  async function call(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown }> {
    const res = await client.rpc(fn, args);
    if (res.error) throw mapStoreError(res.error);
    return { data: res.data };
  }

  async function ownership(
    itemId: string,
  ): Promise<{ quantity: number; equipped: boolean }> {
    const res = await client
      .from("shop_inventory")
      .select("quantity, equipped")
      .eq("item_id", itemId)
      .maybeSingle();
    if (res.error || !isRecord(res.data)) {
      return { quantity: 0, equipped: false };
    }
    return {
      quantity: num(res.data.quantity),
      equipped: bool(res.data.equipped),
    };
  }

  return {
    async listItems(): Promise<ShopItemSummary[]> {
      const res = await client
        .from("shop_items")
        .select(ITEM_COLUMNS)
        .order("slug", { ascending: true });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((t) => {
        const s = toSummary(t);
        return s ? [s] : [];
      });
    },

    async getItem(id: string): Promise<ShopItemDetail | null> {
      const res = await client
        .from("shop_items")
        .select(ITEM_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const summary = toSummary(res.data);
      if (!summary) return null;
      const own = await ownership(id);
      return { ...summary, ownedQuantity: own.quantity, equipped: own.equipped };
    },

    async purchaseItem(id, requestId, clanId): Promise<string> {
      const { data } = await call("fn_purchase_item", {
        p_item: id,
        p_clan: clanId ?? null,
        p_request: requestId,
      });
      if (typeof data !== "string") throw new ConflictError("PURCHASE_FAILED");
      return data;
    },

    async getInventory(): Promise<InventoryEntry[]> {
      const res = await client
        .from("shop_inventory")
        .select(
          "quantity, equipped, expires_at, shop_items!inner(id, slug, name, category, item_type, preview_key, consumable, equippable, effect)",
        )
        .gt("quantity", 0)
        .order("granted_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      const out: InventoryEntry[] = [];
      for (const row of res.data) {
        if (!isRecord(row) || !isRecord(row.shop_items)) continue;
        const item = row.shop_items;
        if (typeof item.id !== "string") continue;
        out.push({
          itemId: item.id,
          slug: str(item.slug),
          name: str(item.name),
          category: str(item.category),
          itemType: str(item.item_type),
          quantity: num(row.quantity),
          equipped: bool(row.equipped),
          expiresAt: optStr(row.expires_at),
          previewKey: optStr(item.preview_key),
          consumable: bool(item.consumable),
          equippable: bool(item.equippable),
          effect: optStr(item.effect),
        });
      }
      return out;
    },

    async getClanInventory(clanId: string): Promise<InventoryEntry[]> {
      const res = await client
        .from("clan_inventory")
        .select(
          "quantity, equipped, shop_items!inner(id, slug, name, category, item_type, preview_key, consumable, equippable, effect)",
        )
        .eq("clan_id", clanId)
        .gt("quantity", 0);
      if (res.error || !Array.isArray(res.data)) return [];
      const out: InventoryEntry[] = [];
      for (const row of res.data) {
        if (!isRecord(row) || !isRecord(row.shop_items)) continue;
        const item = row.shop_items;
        if (typeof item.id !== "string") continue;
        out.push({
          itemId: item.id,
          slug: str(item.slug),
          name: str(item.name),
          category: str(item.category),
          itemType: str(item.item_type),
          quantity: num(row.quantity),
          equipped: bool(row.equipped),
          expiresAt: null,
          previewKey: optStr(item.preview_key),
          consumable: bool(item.consumable),
          equippable: bool(item.equippable),
          effect: optStr(item.effect),
        });
      }
      return out;
    },

    async equipItem(id, equip, clanId): Promise<void> {
      await call("fn_equip_item", {
        p_item: id,
        p_equip: equip,
        p_clan: clanId ?? null,
      });
    },

    async useItem(id, context): Promise<number> {
      const { data } = await call("fn_use_consumable", {
        p_item: id,
        p_context: context ?? {},
      });
      if (typeof data !== "number") throw new ConflictError("USE_FAILED");
      return data;
    },

    async createItem(input: ShopItemCreateInput): Promise<string> {
      const { data } = await call("fn_create_shop_item", {
        p_def: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          category: input.category,
          item_type: input.itemType,
          asset_key: input.assetKey,
          preview_key: input.previewKey,
          price_coins: input.priceCoins,
          is_featured: input.featured,
        },
      });
      if (typeof data !== "string") throw new ConflictError("CREATE_FAILED");
      return data;
    },

    async updateItem(id, patch): Promise<void> {
      await call("fn_update_shop_item", { p_item: id, p_patch: patch });
    },

    async setItemActive(id, active): Promise<void> {
      await call("fn_set_item_active", { p_item: id, p_active: active });
    },
  };
}

interface MemoryEntry {
  summary: ShopItemSummary;
  purchaseLimitTotal: number | null;
  purchaseLimitDaily: number | null;
  owned: number;
  equipped: boolean;
  clanOwned: Map<string, { quantity: number; equipped: boolean }>;
  purchasesByKey: Map<string, string>;
  purchaseCount: number;
  dailyCount: number;
}

export interface MemoryShopSeedItem extends ShopItemSummary {
  purchaseLimitTotal?: number | null;
  purchaseLimitDaily?: number | null;
  owned?: number;
  equipped?: boolean;
  staffClans?: string[];
}

/** Offline store for unit/API tests (single-coin-ledger semantics). */
export function createMemoryShopStore(
  seed: { coins?: number; items?: MemoryShopSeedItem[]; staffClans?: string[] } = {},
): ShopStore & { __coins: { balance: number }; __items: MemoryEntry[] } {
  let balance = seed.coins ?? 0;
  const coins = {
    get balance(): number {
      return balance;
    },
  };
  const entries: MemoryEntry[] = (seed.items ?? []).map((t) => ({
    summary: {
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      category: t.category,
      itemType: t.itemType,
      previewKey: t.previewKey,
      assetKey: t.assetKey,
      priceCoins: t.priceCoins,
      isActive: t.isActive,
      isFeatured: t.isFeatured,
      availableFrom: t.availableFrom,
      availableTo: t.availableTo,
      maxOwn: t.maxOwn,
      consumable: t.consumable,
      equippable: t.equippable,
      effect: t.effect,
    },
    purchaseLimitTotal: t.purchaseLimitTotal ?? null,
    purchaseLimitDaily: t.purchaseLimitDaily ?? null,
    owned: t.owned ?? 0,
    equipped: t.equipped ?? false,
    clanOwned: new Map(),
    purchasesByKey: new Map(),
    purchaseCount: 0,
    dailyCount: 0,
  }));
  const staffClans = new Set(seed.staffClans ?? []);
  let counter = entries.length;
  const tick = (): Promise<void> => Promise.resolve();
  const need = (id: string): MemoryEntry => {
    const t = entries.find((x) => x.summary.id === id);
    if (!t) throw new NotFoundError("NOT_FOUND");
    return t;
  };

  return {
    __coins: coins,
    __items: entries,

    async listItems(): Promise<ShopItemSummary[]> {
      await tick();
      return entries
        .filter((t) => t.summary.isActive)
        .map((t) => ({ ...t.summary }));
    },

    async getItem(id): Promise<ShopItemDetail | null> {
      await tick();
      const t = entries.find((x) => x.summary.id === id && x.summary.isActive) ?? null;
      if (!t) return null;
      return { ...t.summary, ownedQuantity: t.owned, equipped: t.equipped };
    },

    async purchaseItem(id, requestId, clanId): Promise<string> {
      await tick();
      const t = need(id);
      const s = t.summary;
      if (!s.isActive) throw new ConflictError("INACTIVE");
      const key = clanId
        ? `shop:${id}:user:me:clan:${clanId}:purchase:${requestId}`
        : `shop:${id}:user:me:purchase:${requestId}`;
      const replay = t.purchasesByKey.get(key);
      if (replay) return replay;
      if (clanId) {
        if (s.itemType !== "clan_cosmetic") throw new ConflictError("MALFORMED");
        if (!staffClans.has(clanId)) throw new ForbiddenError("FORBIDDEN");
      } else if (s.itemType === "clan_cosmetic") {
        throw new ConflictError("MALFORMED");
      }
      if (
        (t.purchaseLimitTotal !== null && t.purchaseCount >= t.purchaseLimitTotal) ||
        (t.purchaseLimitDaily !== null && t.dailyCount >= t.purchaseLimitDaily)
      ) {
        throw new ConflictError("LIMIT");
      }
      const owned = clanId
        ? (t.clanOwned.get(clanId)?.quantity ?? 0)
        : t.owned;
      if (owned + 1 > s.maxOwn) throw new ConflictError("LIMIT");
      if (balance < s.priceCoins) throw new ConflictError("INSUFFICIENT");
      balance -= s.priceCoins;
      counter += 1;
      const pid = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
      t.purchasesByKey.set(key, pid);
      t.purchaseCount += 1;
      t.dailyCount += 1;
      if (clanId) {
        const cur = t.clanOwned.get(clanId) ?? { quantity: 0, equipped: false };
        cur.quantity += 1;
        t.clanOwned.set(clanId, cur);
      } else {
        t.owned += 1;
      }
      return pid;
    },

    async getInventory(): Promise<InventoryEntry[]> {
      await tick();
      return entries
        .filter((t) => t.owned > 0)
        .map((t) => ({
          itemId: t.summary.id,
          slug: t.summary.slug,
          name: t.summary.name,
          category: t.summary.category,
          itemType: t.summary.itemType,
          quantity: t.owned,
          equipped: t.equipped,
          expiresAt: null,
          previewKey: t.summary.previewKey,
          consumable: t.summary.consumable,
          equippable: t.summary.equippable,
          effect: t.summary.effect,
        }));
    },

    async getClanInventory(clanId): Promise<InventoryEntry[]> {
      await tick();
      return entries
        .filter((t) => (t.clanOwned.get(clanId)?.quantity ?? 0) > 0)
        .map((t) => {
          const cur = t.clanOwned.get(clanId) ?? { quantity: 0, equipped: false };
          return {
            itemId: t.summary.id,
            slug: t.summary.slug,
            name: t.summary.name,
            category: t.summary.category,
            itemType: t.summary.itemType,
            quantity: cur.quantity,
            equipped: cur.equipped,
            expiresAt: null,
            previewKey: t.summary.previewKey,
            consumable: t.summary.consumable,
            equippable: t.summary.equippable,
            effect: t.summary.effect,
          };
        });
    },

    async equipItem(id, equip, clanId): Promise<void> {
      await tick();
      const t = need(id);
      const s = t.summary;
      if (!s.equippable) throw new ConflictError("MALFORMED");
      if (clanId) {
        if (s.itemType !== "clan_cosmetic") throw new ConflictError("MALFORMED");
        if (!staffClans.has(clanId)) throw new ForbiddenError("FORBIDDEN");
        const cur = t.clanOwned.get(clanId);
        if (!cur || cur.quantity === 0) throw new NotFoundError("NOT_FOUND");
        cur.equipped = equip;
        return;
      }
      if (s.itemType === "clan_cosmetic") throw new ConflictError("MALFORMED");
      if (t.owned === 0) throw new NotFoundError("NOT_FOUND");
      t.equipped = equip;
    },

    async useItem(id): Promise<number> {
      await tick();
      const t = need(id);
      if (!t.summary.consumable) throw new ConflictError("MALFORMED");
      if (t.owned === 0) throw new NotFoundError("NOT_FOUND");
      t.owned -= 1;
      return t.owned;
    },

    async createItem(input: ShopItemCreateInput): Promise<string> {
      await tick();
      if (!input.slug.trim() || !input.name.trim()) {
        throw new ConflictError("MALFORMED");
      }
      counter += 1;
      const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
      entries.push({
        summary: {
          id,
          slug: input.slug,
          name: input.name,
          description: input.description,
          category: input.category,
          itemType: input.itemType,
          previewKey: input.previewKey,
          assetKey: input.assetKey,
          priceCoins: input.priceCoins,
          isActive: false,
          isFeatured: input.featured,
          availableFrom: null,
          availableTo: null,
          maxOwn: 1,
          consumable: false,
          equippable: true,
          effect: null,
        },
        purchaseLimitTotal: null,
        purchaseLimitDaily: null,
        owned: 0,
        equipped: false,
        clanOwned: new Map(),
        purchasesByKey: new Map(),
        purchaseCount: 0,
        dailyCount: 0,
      });
      return id;
    },

    async updateItem(id, patch): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.isActive) throw new ConflictError("NOT_DRAFT");
      if (typeof patch.name === "string" && patch.name) t.summary.name = patch.name;
      if (typeof patch.priceCoins === "number") t.summary.priceCoins = patch.priceCoins;
    },

    async setItemActive(id, active): Promise<void> {
      await tick();
      need(id).summary.isActive = active;
    },
  };
}
