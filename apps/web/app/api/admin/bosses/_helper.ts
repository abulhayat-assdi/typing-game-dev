/**
 * Admin boss gate (M12). M7 adminContext for roles, then a BossStore.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseBossStore,
  type BossDefinitionInput,
  type BossStore,
} from "../../../../lib/server/boss-store";
import { adminContext } from "../_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface BossAdminDeps {
  actor: Actor;
  store: BossStore;
}

export function isBossAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

export function toBossAdminError(e: unknown): NextResponse {
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

export async function bossAdminContext(): Promise<
  BossAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isBossAdminActor(ctx.actor)) {
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
  return { actor: ctx.actor, store: createSupabaseBossStore(client) };
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

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

const DIFFICULTIES = new Set(["easy", "normal", "hard", "nightmare"]);

export async function handleListBosses(
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  return NextResponse.json({ bosses: await deps.store.listBosses() });
}

export async function handleCreateBoss(
  body: unknown,
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!isRecord(body)) return badRequest();
  const slug = strField(body, "slug");
  const name = strField(body, "title") || strField(body, "name");
  const difficulty = strField(body, "difficulty") || "normal";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return badRequest();
  if (name.length < 1 || name.length > 120) return badRequest();
  if (!DIFFICULTIES.has(difficulty)) return badRequest();
  const maxHp =
    typeof body.maxHp === "number" && Number.isInteger(body.maxHp) && body.maxHp > 0
      ? body.maxHp
      : 0;
  if (maxHp <= 0) return badRequest();
  const rawPhases = Array.isArray(body.phases) ? body.phases : [];
  if (rawPhases.length === 0) return badRequest();
  const phases: BossDefinitionInput["phases"] = [];
  for (const [i, p] of rawPhases.entries()) {
    if (!isRecord(p)) return badRequest();
    const hpFrom = typeof p.hpFrom === "number" ? p.hpFrom : 0;
    const hpTo = typeof p.hpTo === "number" ? p.hpTo : -1;
    const multiplier = typeof p.multiplier === "number" && p.multiplier > 0
      ? p.multiplier
      : 1;
    if (!(hpFrom > hpTo) || hpTo < 0) return badRequest();
    phases.push({
      position: i,
      name: typeof p.name === "string" ? p.name : "",
      hpFrom,
      hpTo,
      multiplier,
      rules: isRecord(p.rules) ? p.rules : {},
      games: Array.isArray(p.games)
        ? p.games.filter((g): g is string => typeof g === "string")
        : [],
    });
  }
  if (phases[0]?.hpFrom !== maxHp) return badRequest();
  const last = phases[phases.length - 1];
  if (!last || last.hpTo !== 0) return badRequest();
  const rewardXp =
    typeof body.rewardXp === "number" && body.rewardXp >= 0
      ? Math.floor(body.rewardXp)
      : 0;
  const rewardCoins =
    typeof body.rewardCoins === "number" && body.rewardCoins >= 0
      ? Math.floor(body.rewardCoins)
      : 0;
  try {
    const id = await deps.store.createBoss({
      slug,
      name,
      description: strField(body, "description"),
      lore: strField(body, "lore"),
      difficulty,
      maxHp,
      phases,
      rewardXp,
      rewardCoins,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toBossAdminError(e);
  }
}

export async function handleBossStatus(
  id: string,
  status: string,
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id) || (status !== "active" && status !== "inactive")) {
    return badRequest();
  }
  try {
    await deps.store.setBossStatus(id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return toBossAdminError(e);
  }
}

export async function handleCreateInstance(
  body: unknown,
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!isRecord(body)) return badRequest();
  const bossId = typeof body.bossId === "string" ? body.bossId : "";
  const clanId = typeof body.clanId === "string" ? body.clanId : "";
  const startAt = typeof body.startAt === "string" ? body.startAt : "";
  const endAt = typeof body.endAt === "string" ? body.endAt : "";
  if (!validUuid(bossId) || !validUuid(clanId)) return badRequest();
  if (
    !startAt || !endAt ||
    Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(endAt)) ||
    Date.parse(endAt) <= Date.parse(startAt)
  ) {
    return badRequest();
  }
  try {
    const id = await deps.store.createInstance(bossId, clanId, startAt, endAt);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toBossAdminError(e);
  }
}

export async function handleActivateInstance(
  id: string,
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id)) return badRequest();
  try {
    await deps.store.activateInstance(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toBossAdminError(e);
  }
}

export async function handleFinalizeInstance(
  id: string,
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id)) return badRequest();
  try {
    return NextResponse.json(await deps.store.finalizeInstance(id));
  } catch (e) {
    return toBossAdminError(e);
  }
}

export async function handleAdvanceInstance(
  id: string,
  deps: BossAdminDeps,
): Promise<Response> {
  if (!isBossAdminActor(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(id)) return badRequest();
  try {
    return NextResponse.json({ status: await deps.store.advanceInstance(id) });
  } catch (e) {
    return toBossAdminError(e);
  }
}
