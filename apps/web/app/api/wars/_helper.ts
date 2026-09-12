/**
 * Shared war-route gate (M11). Session + user-scoped store, safe codes.
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
  createSupabaseWarStore,
  type ChallengeInput,
  type WarStore,
} from "../../../lib/server/war-store";
import enErrors from "../../../messages/en/errors.json";

export interface WarContext {
  session: Session;
  store: WarStore;
}

export interface WarDeps {
  session: Session | null;
  store: WarStore | null;
}

export function toWarError(e: unknown): NextResponse {
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

export async function warContext(): Promise<WarContext | NextResponse> {
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
  return { session, store: createSupabaseWarStore(client) };
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

export function unknownWar(): NextResponse {
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

function gate(deps: WarDeps): WarContext | NextResponse {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  return { session: deps.session, store: deps.store };
}

const SCOPES = new Set(["same_course", "cross_course", "same_org", "cross_org"]);

export async function handleListWars(deps: WarDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ wars: await ctx.store.listWars() });
}

export async function handleChallenge(
  body: unknown,
  deps: WarDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const defenderClanId =
    typeof body.defenderClanId === "string" ? body.defenderClanId : "";
  const gameSlugs = Array.isArray(body.gameSlugs)
    ? body.gameSlugs.filter((g): g is string => typeof g === "string" && g.length > 0)
    : [];
  const scope = typeof body.scope === "string" ? body.scope : "same_course";
  const prepHours =
    typeof body.prepHours === "number" ? Math.max(0, Math.floor(body.prepHours)) : 2;
  const battleHours =
    typeof body.battleHours === "number"
      ? Math.min(5, Math.max(1, Math.floor(body.battleHours)))
      : 2;
  const attemptsPerPlayer =
    typeof body.attemptsPerPlayer === "number" &&
    Number.isInteger(body.attemptsPerPlayer) &&
    body.attemptsPerPlayer > 0
      ? body.attemptsPerPlayer
      : 5;
  if (!validUuid(defenderClanId) || gameSlugs.length === 0 || !SCOPES.has(scope)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const input: ChallengeInput = {
    defenderClanId,
    gameSlugs,
    scope,
    prepHours,
    battleHours,
    attemptsPerPlayer,
  };
  try {
    const id = await ctx.store.challenge(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toWarError(e);
  }
}

export async function handleGetWar(
  id: string,
  deps: WarDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownWar();
  const war = await ctx.store.getWar(id);
  if (!war) return unknownWar();
  return NextResponse.json({ war });
}

async function act(
  id: string,
  deps: WarDeps,
  fn: (store: WarStore) => Promise<unknown>,
  okExtra?: (out: unknown) => Record<string, unknown>,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownWar();
  try {
    const out = await fn(ctx.store);
    return NextResponse.json({ ok: true, ...(okExtra ? okExtra(out) : {}) });
  } catch (e) {
    return toWarError(e);
  }
}

export async function handleDispatch(
  id: string,
  deps: WarDeps,
): Promise<Response> {
  return act(id, deps, (s) => s.dispatch(id));
}

export async function handleRespond(
  id: string,
  body: unknown,
  deps: WarDeps,
): Promise<Response> {
  const accept = isRecord(body) && body.accept === true;
  return act(id, deps, (s) => s.respond(id, accept));
}

export async function handleCancel(id: string, deps: WarDeps): Promise<Response> {
  return act(id, deps, (s) => s.cancel(id));
}

export async function handleAdvance(id: string, deps: WarDeps): Promise<Response> {
  return act(id, deps, (s) => s.advance(id), (status) => ({
    status: typeof status === "string" ? status : "",
  }));
}

export async function handleSubmit(
  id: string,
  body: unknown,
  deps: WarDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownWar();
  let attemptId =
    isRecord(body) && typeof body.attemptId === "string" ? body.attemptId : "";
  if (!attemptId && isRecord(body) && body.latest === true) {
    const war = await ctx.store.getWar(id);
    const gameSlug = war?.gameSlugs[0];
    if (!war || !gameSlug) return unknownWar();
    const latest = await ctx.store.getLatestValidAttempt(
      gameSlug,
      ctx.session.userId,
    );
    if (!latest) {
      return NextResponse.json(
        { error: "NO_VALID_ATTEMPT", message: enErrors.fileNotAvailable },
        { status: 404 },
      );
    }
    attemptId = latest.id;
  }
  if (!validUuid(attemptId)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  return act(id, ctx, (s) => s.submitAttempt(id, attemptId), (sub) => ({
    submissionId: typeof sub === "string" ? sub : "",
  }));
}

export async function handleSync(id: string, deps: WarDeps): Promise<Response> {
  return act(id, deps, (s) => s.sync(id), (status) => ({
    status: typeof status === "string" ? status : "",
  }));
}

export async function handleFinalize(
  id: string,
  deps: WarDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownWar();
  try {
    return NextResponse.json(await ctx.store.finalize(id));
  } catch (e) {
    return toWarError(e);
  }
}

export async function handleBoard(id: string, deps: WarDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownWar();
  const war = await ctx.store.getWar(id);
  if (!war) return unknownWar();
  return NextResponse.json({ board: await ctx.store.getBoard(id) });
}

export async function handleChallengeable(
  deps: WarDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ clans: await ctx.store.challengeable() });
}
