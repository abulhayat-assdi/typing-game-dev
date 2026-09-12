/**
 * Shared boss-route gate (M12). Session + user-scoped store, safe codes.
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
  createSupabaseBossStore,
  type BossStore,
} from "../../../lib/server/boss-store";
import enErrors from "../../../messages/en/errors.json";

export interface BossContext {
  session: Session;
  store: BossStore;
}

export interface BossDeps {
  session: Session | null;
  store: BossStore | null;
}

export function toBossError(e: unknown): NextResponse {
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

export async function bossContext(): Promise<BossContext | NextResponse> {
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
  return { session, store: createSupabaseBossStore(client) };
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

export function unknownBoss(): NextResponse {
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

function gate(deps: BossDeps): BossContext | NextResponse {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  return { session: deps.session, store: deps.store };
}

export async function handleListBosses(deps: BossDeps): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  const [bosses, instances] = await Promise.all([
    ctx.store.listBosses(),
    ctx.store.listMyInstances(),
  ]);
  return NextResponse.json({ bosses, instances });
}

export async function handleGetBoss(
  instanceId: string,
  deps: BossDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(instanceId)) return unknownBoss();
  const state = await ctx.store.getState(instanceId);
  if (!state) return unknownBoss();
  return NextResponse.json({ state });
}

export async function handleSubmitBoss(
  instanceId: string,
  body: unknown,
  deps: BossDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(instanceId)) return unknownBoss();
  const attemptId =
    isRecord(body) && typeof body.attemptId === "string" ? body.attemptId : "";
  if (!validUuid(attemptId)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    const damage = await ctx.store.submitAttempt(instanceId, attemptId);
    const state = await ctx.store.getState(instanceId);
    return NextResponse.json({ ok: true, damage, state });
  } catch (e) {
    return toBossError(e);
  }
}
