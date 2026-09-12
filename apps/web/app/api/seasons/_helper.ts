/**
 * Shared season-route gate (M13). Session + user-scoped store, safe codes.
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
  createSupabaseSeasonStore,
  type SeasonCreateInput,
  type SeasonStore,
} from "../../../lib/server/season-store";
import enErrors from "../../../messages/en/errors.json";

export interface SeasonContext {
  session: Session;
  store: SeasonStore;
}

export interface SeasonDeps {
  session: Session | null;
  store: SeasonStore | null;
}

export function toSeasonError(e: unknown): NextResponse {
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

export async function seasonContext(): Promise<SeasonContext | NextResponse> {
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
  return { session, store: createSupabaseSeasonStore(client) };
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

export function unknownSeason(): NextResponse {
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

function gate(deps: SeasonDeps): SeasonContext | NextResponse {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  return { session: deps.session, store: deps.store };
}

export async function handleListSeasons(deps: SeasonDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ seasons: await ctx.store.listSeasons() });
}

export async function handleGetSeason(
  id: string,
  deps: SeasonDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownSeason();
  const season = await ctx.store.getSeason(id, ctx.session.userId);
  if (!season) return unknownSeason();
  return NextResponse.json({ season });
}

export async function handleSeasonBoard(
  id: string,
  type: string,
  deps: SeasonDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownSeason();
  const season = await ctx.store.getSeason(id, ctx.session.userId);
  if (!season) return unknownSeason();
  return NextResponse.json({
    board: await ctx.store.getBoard(id, type === "clan" ? "clan" : "student"),
  });
}

export type { SeasonCreateInput };
