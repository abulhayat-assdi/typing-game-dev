/**
 * Shared student mission-route gate (M9). Session + user-scoped store,
 * safe error codes. RLS + SECURITY DEFINER fns enforce underneath.
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
  createSupabaseMissionStore,
  type MissionStore,
} from "../../../lib/server/mission-store";
import enErrors from "../../../messages/en/errors.json";

export interface MissionContext {
  session: Session;
  store: MissionStore;
}

export function toMissionError(e: unknown): NextResponse {
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

export async function missionContext(): Promise<
  MissionContext | NextResponse
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
  return { session, store: createSupabaseMissionStore(client) };
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

export function strField(body: unknown, key: string): string {
  if (!isRecord(body)) return "";
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export function unknownMission(): NextResponse {
  return NextResponse.json(
    { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
    { status: 404 },
  );
}

export function validUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

export interface MissionDeps {
  session: Session | null;
  store: MissionStore | null;
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

/** Split today's set by period for the hub + dashboard widgets. */
export async function handleGetMissions(deps: MissionDeps): Promise<Response> {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  const all = await deps.store.getToday(deps.session.userId);
  return NextResponse.json({
    daily: all.filter((m) => m.period === "daily"),
    weekly: all.filter((m) => m.period === "weekly"),
    event: all.filter((m) => m.period === "event"),
  });
}

export async function handleGetMission(
  instanceId: string,
  deps: MissionDeps,
): Promise<Response> {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  if (!validUuid(instanceId)) return unknownMission();
  const mission = await deps.store.getInstance(instanceId);
  if (!mission) return unknownMission();
  return NextResponse.json({ mission });
}

export async function handleStartMission(
  instanceId: string,
  deps: MissionDeps,
): Promise<Response> {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  if (!validUuid(instanceId)) return unknownMission();
  try {
    await deps.store.startMission(instanceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toMissionError(e);
  }
}

export async function handleSyncMissions(
  deps: MissionDeps,
): Promise<Response> {
  if (!deps.session) return unauthorized();
  if (!deps.store) return unavailable();
  try {
    const synced = await deps.store.syncMissions(deps.session.userId);
    const all = await deps.store.getToday(deps.session.userId);
    return NextResponse.json({
      synced,
      daily: all.filter((m) => m.period === "daily"),
      weekly: all.filter((m) => m.period === "weekly"),
      event: all.filter((m) => m.period === "event"),
    });
  } catch (e) {
    return toMissionError(e);
  }
}
