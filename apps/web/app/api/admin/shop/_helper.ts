/**
 * Shop admin gate (M16). Global catalog: mission/super admins only.
 * Teachers and students are rejected at the route; SQL re-checks.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  createSupabaseShopStore,
  type ShopItemCreateInput,
  type ShopStore,
} from "../../../../lib/server/shop-store";
import { adminContext } from "../_helper";
import { isRecord, toShopError } from "../../shop/_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface ShopAdminDeps {
  actor: Actor;
  store: ShopStore;
}

export function isShopAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

function forbiddenShop(): NextResponse {
  return NextResponse.json(
    { error: "FORBIDDEN", message: enErrors.permissionDenied },
    { status: 403 },
  );
}

export async function shopAdminContext(): Promise<
  ShopAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isShopAdminActor(ctx.actor)) return forbiddenShop();
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseShopStore(client) };
}

export function strField(body: unknown, key: string): string {
  if (!isRecord(body)) return "";
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

export function validUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

const CATEGORIES = [
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
];

const TYPES = ["cosmetic", "profile", "clan_cosmetic", "utility"];

export async function handleListCatalog(
  deps: ShopAdminDeps,
): Promise<Response> {
  if (!isShopAdminActor(deps.actor)) return forbiddenShop();
  try {
    return NextResponse.json({ items: await deps.store.listItems() });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleCreateItem(
  body: unknown,
  deps: ShopAdminDeps,
): Promise<Response> {
  if (!isShopAdminActor(deps.actor)) return forbiddenShop();
  if (!isRecord(body)) return badRequest();
  const slug = strField(body, "slug");
  const name = strField(body, "name");
  const category = strField(body, "category");
  const itemType = strField(body, "itemType");
  const priceRaw = body.priceCoins;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return badRequest();
  if (name.length < 1 || name.length > 160) return badRequest();
  if (!CATEGORIES.includes(category) || !TYPES.includes(itemType)) {
    return badRequest();
  }
  if (typeof priceRaw !== "number" || !Number.isInteger(priceRaw) || priceRaw < 0) {
    return badRequest();
  }
  const input: ShopItemCreateInput = {
    slug,
    name,
    description: strField(body, "description"),
    category,
    itemType,
    assetKey: strField(body, "assetKey") || null,
    previewKey: strField(body, "previewKey") || null,
    priceCoins: priceRaw,
    featured: body.featured === true,
  };
  try {
    const id = await deps.store.createItem(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleShopAction(
  id: string,
  action: string,
  body: unknown,
  deps: ShopAdminDeps,
): Promise<Response> {
  if (!isShopAdminActor(deps.actor)) return forbiddenShop();
  if (!validUuid(id)) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  try {
    switch (action) {
      case "update":
        await deps.store.updateItem(id, isRecord(body) ? body : {});
        return NextResponse.json({ ok: true });
      case "activate":
        await deps.store.setItemActive(id, true);
        return NextResponse.json({ ok: true });
      case "deactivate":
        await deps.store.setItemActive(id, false);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json(
          { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
          { status: 404 },
        );
    }
  } catch (e) {
    return toShopError(e);
  }
}
