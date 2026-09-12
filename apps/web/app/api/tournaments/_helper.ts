/**
 * Shared tournament-route gate (M14). Session + user-scoped store, safe
 * codes. RLS + SECURITY DEFINER fns enforce underneath; students may only
 * register/withdraw themselves (identity comes from auth.uid() in SQL).
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
  createSupabaseTournamentStore,
  type TournamentStore,
} from "../../../lib/server/tournament-store";
import enErrors from "../../../messages/en/errors.json";

export interface TournamentContext {
  session: Session;
  store: TournamentStore;
}

export interface TournamentDeps {
  session: Session | null;
  store: TournamentStore | null;
}

export function toTournamentError(e: unknown): NextResponse {
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

export async function tournamentContext(): Promise<
  TournamentContext | NextResponse
> {
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
  return { session, store: createSupabaseTournamentStore(client) };
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

export function unknownTournament(): NextResponse {
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

function gate(deps: TournamentDeps): TournamentContext | NextResponse {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  return { session: deps.session, store: deps.store };
}

export async function handleListTournaments(
  deps: TournamentDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({
      tournaments: await ctx.store.listTournaments(),
    });
  } catch (e) {
    return toTournamentError(e);
  }
}

export async function handleGetTournament(
  id: string,
  deps: TournamentDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownTournament();
  try {
    const tournament = await ctx.store.getTournament(id, ctx.session.userId);
    if (!tournament) return unknownTournament();
    return NextResponse.json({ tournament });
  } catch (e) {
    return toTournamentError(e);
  }
}

export async function handleTournamentBoard(
  id: string,
  deps: TournamentDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownTournament();
  try {
    const tournament = await ctx.store.getTournament(id, ctx.session.userId);
    if (!tournament) return unknownTournament();
    return NextResponse.json({
      rounds: await ctx.store.getBracket(id),
      results: tournament.results,
      status: tournament.status,
    });
  } catch (e) {
    return toTournamentError(e);
  }
}

function clanIdFrom(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const v = body.clanId;
  if (typeof v !== "string" || v.length === 0) return undefined;
  if (!validUuid(v)) throw new ConflictError("MALFORMED");
  return v;
}

export async function handleRegister(
  id: string,
  body: unknown,
  deps: TournamentDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownTournament();
  try {
    await ctx.store.registerTournament(id, ctx.session.userId, clanIdFrom(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toTournamentError(e);
  }
}

export async function handleWithdraw(
  id: string,
  body: unknown,
  deps: TournamentDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownTournament();
  try {
    await ctx.store.withdrawTournament(id, ctx.session.userId, clanIdFrom(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toTournamentError(e);
  }
}
