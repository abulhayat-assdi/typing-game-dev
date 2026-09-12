/**
 * Clan admin gate (M10). M7 adminContext for role enforcement, then a
 * ClanStore. Clan writes re-check fn_can_manage_clan in the database.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseClanStore,
  type ClanStore,
} from "../../../../lib/server/clan-store";
import { adminContext } from "../_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface ClanAdminDeps {
  actor: Actor;
  store: ClanStore;
}

export function isClanAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

export function toClanAdminError(e: unknown): NextResponse {
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

export async function clanAdminContext(): Promise<
  ClanAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isClanAdminActor(ctx.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseClanStore(client) };
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

export function validUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

export async function handleListClans(
  deps: ClanAdminDeps,
): Promise<Response> {
  if (!isClanAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  return NextResponse.json({ clans: await deps.store.listClans() });
}

export async function handleUpdateClan(
  id: string,
  body: unknown,
  deps: ClanAdminDeps,
): Promise<Response> {
  if (!isClanAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id) || !isRecord(body)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "motto", "description", "banner_key", "emblem_key"]) {
    if (typeof body[k] === "string") patch[k] = body[k];
  }
  try {
    await deps.store.setClanProfile(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toClanAdminError(e);
  }
}

export async function handleClanStatus(
  id: string,
  status: string,
  deps: ClanAdminDeps,
): Promise<Response> {
  if (!isClanAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id) || (status !== "active" && status !== "inactive")) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    await deps.store.setClanStatus(id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return toClanAdminError(e);
  }
}

const ROLES = new Set(["leader", "co_leader", "member"]);

export async function handleAssignRole(
  id: string,
  body: unknown,
  deps: ClanAdminDeps,
): Promise<Response> {
  if (!isClanAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id) || !isRecord(body)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!validUuid(userId) || !ROLES.has(role)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    await deps.store.assignRole(id, userId, role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toClanAdminError(e);
  }
}

export async function handleLinkMission(
  id: string,
  body: unknown,
  deps: ClanAdminDeps,
): Promise<Response> {
  if (!isClanAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id) || !isRecord(body)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const missionId = typeof body.missionId === "string" ? body.missionId : "";
  if (!validUuid(missionId)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    const clanMissionId = await deps.store.linkMission(id, missionId);
    return NextResponse.json({ ok: true, clanMissionId }, { status: 201 });
  } catch (e) {
    return toClanAdminError(e);
  }
}
