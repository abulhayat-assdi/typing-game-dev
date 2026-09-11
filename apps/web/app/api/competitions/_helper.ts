/**
 * Shared competition-route gate (M8). Every /api/competitions handler
 * resolves the session, builds the user-scoped store, and maps errors to
 * safe codes. Database RLS + SECURITY DEFINER fns remain the final
 * enforcers; these checks produce clean 401/403/409/404s.
 */
import { NextResponse } from "next/server";
import {
  getSession,
  userDbClient,
  type Session,
} from "../../../lib/server/auth";
import {
  AuthApiError,
  requireRoles,
  type Actor,
} from "../../../lib/server/staff";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseCompetitionStore,
  type CompetitionStore,
} from "../../../lib/server/competition-store";
import enErrors from "../../../messages/en/errors.json";

export interface CompetitionContext {
  session: Session;
  store: CompetitionStore;
}

export interface StaffCompetitionContext extends CompetitionContext {
  actor: Actor;
}

export function toCompetitionError(e: unknown): NextResponse {
  if (e instanceof AuthApiError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  }
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

/** Any authenticated user with a working store (students included). */
export async function competitionContext(): Promise<
  CompetitionContext | NextResponse
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
  return { session, store: createSupabaseCompetitionStore(client) };
}

/** Teachers, org admins and super admins (DB re-checks per competition). */
export async function staffCompetitionContext(): Promise<
  StaffCompetitionContext | NextResponse
> {
  const base = await competitionContext();
  if (base instanceof NextResponse) return base;
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  try {
    const actor = await requireRoles(client, ["teacher", "admin"]);
    return { ...base, actor };
  } catch (e) {
    return toCompetitionError(e);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Handler-level staff check (route gate + DB re-check behind it). */
export function isStaffActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") ||
    actor.roles.includes("teacher") ||
    actor.roles.includes("admin")
  );
}

export function forbiddenActor(): NextResponse {
  return NextResponse.json(
    { error: "FORBIDDEN", message: enErrors.permissionDenied },
    { status: 403 },
  );
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

export function strField(body: unknown, key: string): string {
  if (!isRecord(body)) return "";
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export function uuidList(body: unknown, key: string): string[] | null {
  if (!isRecord(body)) return null;
  const v: unknown = body[key];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !/^[0-9a-fA-F-]{36}$/.test(x)) return null;
    out.push(x);
  }
  return out;
}

const TRANSITION_TARGETS: Record<string, string> = {
  publish: "scheduled",
  open: "registration_open",
  close: "registration_closed",
};

/**
 * One endpoint = one transition. Callers can never request an arbitrary
 * status; the database re-validates every hop and finalize mints rewards.
 */
export async function handleCompetitionAction(
  id: string,
  action: string,
  deps: StaffCompetitionContext,
): Promise<Response> {
  if (!isStaffActor(deps.actor)) return forbiddenActor();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  try {
    if (action === "finalize") {
      const summary = await deps.store.finalizeCompetition(id);
      return NextResponse.json({ ok: true, summary });
    }
    const to = TRANSITION_TARGETS[action];
    if (!to) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await deps.store.transitionCompetition(id, to);
    return NextResponse.json({ ok: true, status: to });
  } catch (e) {
    return toCompetitionError(e);
  }
}

function validCompetitionId(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

function unknownCompetition(): NextResponse {
  return NextResponse.json(
    { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
    { status: 404 },
  );
}

/** Caller joins the competition; eligibility + duplicates enforced in DB. */
export async function handleRegister(  id: string,
  deps: CompetitionContext,
): Promise<Response> {
  if (!validCompetitionId(id)) return unknownCompetition();
  try {
    const entryId = await deps.store.registerEntry(id, deps.session.userId);
    return NextResponse.json({ ok: true, entryId }, { status: 201 });
  } catch (e) {
    return toCompetitionError(e);
  }
}

/** Server-derived board (0015 projection); outsiders get zero rows. */
export async function handleLeaderboard(
  id: string,
  deps: CompetitionContext,
): Promise<Response> {
  if (!validCompetitionId(id)) return unknownCompetition();
  const competition = await deps.store.getCompetition(id, deps.session.userId);
  if (!competition) return unknownCompetition();
  const rows = await deps.store.getLeaderboard(id);
  return NextResponse.json({ rows });
}

/** Finalized/own result rows (RLS-scoped reads). */
export async function handleResults(
  id: string,
  deps: CompetitionContext,
): Promise<Response> {
  if (!validCompetitionId(id)) return unknownCompetition();
  const competition = await deps.store.getCompetition(id, deps.session.userId);
  if (!competition) return unknownCompetition();
  const results = await deps.store.getResults(id);
  return NextResponse.json({ results });
}

/** Attach one validated attempt; all rules enforced by fn_attach_attempt. */
export async function handleAttach(
  id: string,
  body: unknown,
  deps: CompetitionContext,
): Promise<Response> {
  if (!validCompetitionId(id)) return unknownCompetition();
  const attemptId =
    isRecord(body) && typeof body.attemptId === "string"
      ? body.attemptId.trim()
      : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(attemptId)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    const attachedId = await deps.store.attachAttempt(id, attemptId);
    return NextResponse.json({ ok: true, attachedId });
  } catch (e) {
    return toCompetitionError(e);
  }
}

/**
 * Attach the caller's latest validated attempt for the competition's first
 * game. Convenience over handleAttach; same DB enforcement underneath.
 */
export async function handleAttachLatest(
  id: string,
  deps: CompetitionContext,
): Promise<Response> {
  if (!validCompetitionId(id)) return unknownCompetition();
  const competition = await deps.store.getCompetition(id, deps.session.userId);
  const gameSlug = competition?.gameSlugs[0];
  if (!competition || !gameSlug) return unknownCompetition();
  const candidate = await deps.store.getLatestValidAttempt(
    gameSlug,
    deps.session.userId,
  );
  if (!candidate) {
    return NextResponse.json(
      { error: "NO_VALID_ATTEMPT", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  try {
    const attachedId = await deps.store.attachAttempt(id, candidate.id);
    return NextResponse.json({ ok: true, attachedId });
  } catch (e) {
    return toCompetitionError(e);
  }
}
