/**
 * Shared clan-route gate (M10). Session + user-scoped store, safe codes.
 * RLS + SECURITY DEFINER fns enforce underneath.
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
  createSupabaseClanStore,
  type ClanStore,
} from "../../../lib/server/clan-store";
import enErrors from "../../../messages/en/errors.json";

export interface ClanContext {
  session: Session;
  store: ClanStore;
}

export interface ClanDeps {
  session: Session | null;
  store: ClanStore | null;
}

export function toClanError(e: unknown): NextResponse {
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

export async function clanContext(): Promise<ClanContext | NextResponse> {
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
  return { session, store: createSupabaseClanStore(client) };
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

export function unknownClan(): NextResponse {
  return NextResponse.json(
    { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
    { status: 404 },
  );
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
    { status: 401 },
  );
}

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
    { status: 503 },
  );
}

function gate(deps: ClanDeps): ClanContext | NextResponse {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  return { session: deps.session, store: deps.store };
}

/** Student dashboard bundle: clan, roster, missions, help, activity. */
export async function handleGetClan(deps: ClanDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { session, store } = ctx;
  const clan = await store.getMyClan(session.userId);
  if (!clan) return unknownClan();
  const [roster, missions, help, activity] = await Promise.all([
    store.getRoster(clan.id),
    store.getMissions(clan.id),
    store.getHelpRequests(clan.id),
    store.getActivity(clan.id),
  ]);
  return NextResponse.json({ clan, roster, missions, help, activity });
}

export async function handleGetMembers(deps: ClanDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { session, store } = ctx;
  const clan = await store.getMyClan(session.userId);
  if (!clan) return unknownClan();
  return NextResponse.json({ roster: await store.getRoster(clan.id) });
}

export async function handleGetBoard(
  window: string,
  deps: ClanDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { store } = ctx;
  const w = window === "weekly" || window === "daily" ? window : "all";
  return NextResponse.json({ board: await store.getBoard(w) });
}

export async function handleGetClanMissions(
  deps: ClanDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { session, store } = ctx;
  const clan = await store.getMyClan(session.userId);
  if (!clan) return unknownClan();
  return NextResponse.json({
    missions: await store.getMissions(clan.id),
  });
}

export async function handleStartClanMission(
  id: string,
  deps: ClanDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { store } = ctx;
  if (!validUuid(id)) return unknownClan();
  try {
    await store.startClanMission(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toClanError(e);
  }
}

export async function handleSyncClanMission(
  id: string,
  deps: ClanDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { store } = ctx;
  if (!validUuid(id)) return unknownClan();
  try {
    const status = await store.syncClanMission(id);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return toClanError(e);
  }
}

export async function handleGetHelp(deps: ClanDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { session, store } = ctx;
  const clan = await store.getMyClan(session.userId);
  if (!clan) return unknownClan();
  return NextResponse.json({ help: await store.getHelpRequests(clan.id) });
}

export async function handleCreateHelp(
  body: unknown,
  deps: ClanDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { session, store } = ctx;
  const clan = await store.getMyClan(session.userId);
  if (!clan) return unknownClan();
  const requested =
    isRecord(body) && typeof body.requested === "number"
      ? Math.floor(body.requested)
      : 0;
  const context =
    isRecord(body) && isRecord(body.context) ? body.context : {};
  if (!Number.isInteger(requested) || requested <= 0 || requested > 50) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    const id = await store.createHelpRequest(clan.id, context, requested);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return toClanError(e);
  }
}

export async function handleContributeHelp(
  id: string,
  body: unknown,
  deps: ClanDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const { store } = ctx;
  if (!validUuid(id)) return unknownClan();
  const amount =
    isRecord(body) && typeof body.amount === "number"
      ? Math.floor(body.amount)
      : 0;
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    await store.contributeHelp(id, amount);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toClanError(e);
  }
}
