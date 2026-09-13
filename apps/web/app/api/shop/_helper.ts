/**
 * Shared shop-route gate (M16). Session + user-scoped store, safe codes.
 * RLS + SECURITY DEFINER fns enforce underneath. Prices always come
 * from the database — the client never sends amounts.
 */
import { NextResponse } from "next/server";
import {
  getSession,
  userDbClient,
  type Session,
} from "../../../lib/server/auth";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseShopStore,
  type ShopStore,
} from "../../../lib/server/shop-store";
import enErrors from "../../../messages/en/errors.json";

export interface ShopContext {
  session: Session;
  store: ShopStore;
}

export interface ShopDeps {
  session: Session | null;
  store: ShopStore | null;
}

export function toShopError(e: unknown): NextResponse {
  if (e instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (e instanceof ConflictError) {
    return NextResponse.json(
      { error: e.message, message: enErrors.valuesMismatch },
      { status: 409 },
    );
  }
  if (e instanceof NotFoundError) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { error: "FAILED", message: enErrors.genericDescription },
    { status: 500 },
  );
}

export async function shopContext(): Promise<ShopContext | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
      { status: 401 },
    );
  }
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { session, store: createSupabaseShopStore(client) };
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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

export function unknownItem(): NextResponse {
  return NextResponse.json(
    { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
    { status: 404 },
  );
}

function gate(deps: ShopDeps): ShopContext | NextResponse {
  if (!deps.session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
      { status: 401 },
    );
  }
  if (!deps.store) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { session: deps.session, store: deps.store };
}

export async function handleListItems(deps: ShopDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ items: await ctx.store.listItems() });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleGetItem(
  id: string,
  deps: ShopDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownItem();
  try {
    const item = await ctx.store.getItem(id);
    if (!item) return unknownItem();
    return NextResponse.json({ item });
  } catch (e) {
    return toShopError(e);
  }
}

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

export async function handlePurchase(
  id: string,
  body: unknown,
  deps: ShopDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownItem();
  if (!isRecord(body)) return badRequest();
  // requestId drives idempotency; price/currency are never accepted
  // from the client (forged amounts are structurally impossible).
  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (requestId.length < 1 || requestId.length > 80) return badRequest();
  const clanRaw = body.clanId;
  const clanId =
    typeof clanRaw === "string" && clanRaw.length > 0 ? clanRaw : undefined;
  if (clanId !== undefined && !validUuid(clanId)) return badRequest();
  try {
    const purchaseId = await ctx.store.purchaseItem(id, requestId, clanId);
    const item = await ctx.store.getItem(id);
    return NextResponse.json({ ok: true, purchaseId, item });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleGetInventory(deps: ShopDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ items: await ctx.store.getInventory() });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleGetClanInventory(
  clanId: string,
  deps: ShopDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(clanId)) return unknownItem();
  try {
    return NextResponse.json({
      items: await ctx.store.getClanInventory(clanId),
    });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleEquip(
  body: unknown,
  deps: ShopDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!isRecord(body)) return badRequest();
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!validUuid(itemId)) return badRequest();
  const clanRaw = body.clanId;
  const clanId =
    typeof clanRaw === "string" && clanRaw.length > 0 ? clanRaw : undefined;
  if (clanId !== undefined && !validUuid(clanId)) return badRequest();
  try {
    await ctx.store.equipItem(itemId, body.equip !== false, clanId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toShopError(e);
  }
}

export async function handleUse(
  body: unknown,
  deps: ShopDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!isRecord(body)) return badRequest();
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!validUuid(itemId)) return badRequest();
  try {
    const remaining = await ctx.store.useItem(
      itemId,
      isRecord(body.context) ? body.context : {},
    );
    return NextResponse.json({ ok: true, remaining });
  } catch (e) {
    return toShopError(e);
  }
}
