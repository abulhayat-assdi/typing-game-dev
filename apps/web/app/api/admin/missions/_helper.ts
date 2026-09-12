/**
 * Mission admin gate (M9). Reuses the M7 adminContext for role/org
 * enforcement, then hands handlers a MissionStore. Teachers never reach
 * these handlers (requireAdmin rejects); the DB re-checks per call.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseMissionStore,
  type MissionDefinitionInput,
  type MissionStore,
} from "../../../../lib/server/mission-store";
import { adminContext } from "../_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface MissionAdminDeps {
  actor: Actor;
  store: MissionStore;
}

export function isMissionAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

export function forbiddenMission(): NextResponse {
  return NextResponse.json(
    { error: "FORBIDDEN", message: enErrors.permissionDenied },
    { status: 403 },
  );
}

export function toMissionAdminError(e: unknown): NextResponse {
  if (e instanceof ForbiddenError) return forbiddenMission();
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

export async function missionAdminContext(): Promise<
  MissionAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isMissionAdminActor(ctx.actor)) return forbiddenMission();
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseMissionStore(client) };
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

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

const CATEGORIES = new Set([
  "GAME_COMPLETION",
  "ACCURACY_TARGET",
  "WPM_TARGET",
  "SCORE_TARGET",
  "WORD_COUNT",
  "CHARACTER_COUNT",
  "PERFECT_RUN",
  "COMBO_TARGET",
  "WORLD_PROGRESS",
  "MULTI_GAME",
  "DAILY",
  "WEEKLY",
  "EVENT",
]);

const OBJECTIVE_KINDS = new Set([
  "GAMES_COMPLETED",
  "ACCURACY_REACHED",
  "WPM_REACHED",
  "SCORE_REACHED",
  "CHARS_TYPED",
  "WORDS_TYPED",
  "PERFECT_RUN",
  "DISTINCT_GAMES",
  "PERSONAL_BEST",
  "WORLD_GAMES",
]);

export async function handleListMissions(
  deps: MissionAdminDeps,
): Promise<Response> {
  if (!isMissionAdminActor(deps.actor)) return forbiddenMission();
  const missions = await deps.store.listMissions();
  return NextResponse.json({ missions });
}

export async function handleCreateMission(
  body: unknown,
  deps: MissionAdminDeps,
): Promise<Response> {
  if (!isMissionAdminActor(deps.actor)) return forbiddenMission();
  if (!isRecord(body)) return badRequest();
  const slug = strField(body, "slug");
  const title = strField(body, "title");
  const category = strField(body, "category") || "DAILY";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return badRequest();
  if (title.length < 1 || title.length > 160) return badRequest();
  if (!CATEGORIES.has(category)) return badRequest();
  const rawObjectives = Array.isArray(body.objectives) ? body.objectives : [];
  if (rawObjectives.length === 0) return badRequest();
  const objectives: { kind: string; target: Record<string, unknown> }[] = [];
  for (const o of rawObjectives) {
    if (!isRecord(o)) return badRequest();
    const kind = typeof o.kind === "string" ? o.kind : "";
    if (!OBJECTIVE_KINDS.has(kind)) return badRequest();
    if (!isRecord(o.target)) return badRequest();
    objectives.push({ kind, target: o.target });
  }
  const rewardXp =
    typeof body.rewardXp === "number" && body.rewardXp >= 0
      ? Math.floor(body.rewardXp)
      : 0;
  const rewardCoins =
    typeof body.rewardCoins === "number" && body.rewardCoins >= 0
      ? Math.floor(body.rewardCoins)
      : 0;
  const startsAt = strField(body, "startsAt");
  const endsAt = strField(body, "endsAt");
  if (
    (startsAt && Number.isNaN(Date.parse(startsAt))) ||
    (endsAt && Number.isNaN(Date.parse(endsAt)))
  ) {
    return badRequest();
  }
  const input: MissionDefinitionInput = {
    slug,
    title,
    description: strField(body, "description"),
    category,
    difficulty: strField(body, "difficulty") || "beginner",
    skillBand: strField(body, "skillBand") || null,
    period:
      category === "WEEKLY"
        ? "weekly"
        : category === "EVENT"
          ? "event"
          : "daily",
    objectives,
    gameSlugs: Array.isArray(body.gameSlugs)
      ? body.gameSlugs.filter((g): g is string => typeof g === "string")
      : [],
    worldIds: Array.isArray(body.worldIds)
      ? body.worldIds.filter((w): w is string => typeof w === "string")
      : [],
    rewardXp,
    rewardCoins,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
  };
  try {
    const id = await deps.store.createMission(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toMissionAdminError(e);
  }
}

export function badMissionRequest(): NextResponse {
  return badRequest();
}

export async function handleUpdateMission(
  id: string,
  body: unknown,
  deps: MissionAdminDeps,
): Promise<Response> {
  if (!isMissionAdminActor(deps.actor)) return forbiddenMission();
  if (!/^[0-9a-fA-F-]{36}$/.test(id) || !isRecord(body)) return badRequest();
  const patch: Record<string, unknown> = {};
  const title = strField(body, "title");
  if (title) {
    if (title.length > 160) return badRequest();
    patch.title = title;
  }
  if (typeof body.description === "string") {
    patch.description = body.description;
  }
  if (
    typeof body.rewardXp === "number" ||
    typeof body.rewardCoins === "number"
  ) {
    const xp =
      typeof body.rewardXp === "number" && body.rewardXp >= 0
        ? Math.floor(body.rewardXp)
        : 0;
    const coins =
      typeof body.rewardCoins === "number" && body.rewardCoins >= 0
        ? Math.floor(body.rewardCoins)
        : 0;
    patch.reward_profile = { xp, coins };
  }
  const startsAt = strField(body, "startsAt");
  if (startsAt) {
    if (Number.isNaN(Date.parse(startsAt))) return badRequest();
    patch.starts_at = startsAt;
  }
  const endsAt = strField(body, "endsAt");
  if (endsAt) {
    if (Number.isNaN(Date.parse(endsAt))) return badRequest();
    patch.ends_at = endsAt;
  }
  try {
    await deps.store.updateMissionDraft(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toMissionAdminError(e);
  }
}

export async function handleMissionStatus(
  id: string,
  status: string,
  deps: MissionAdminDeps,
): Promise<Response> {
  if (!isMissionAdminActor(deps.actor)) return forbiddenMission();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  if (status !== "active" && status !== "inactive") {
    return badRequest();
  }
  try {
    await deps.store.setMissionStatus(id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return toMissionAdminError(e);
  }
}

export async function handleAddObjective(
  id: string,
  body: unknown,
  deps: MissionAdminDeps,
): Promise<Response> {
  if (!isMissionAdminActor(deps.actor)) return forbiddenMission();
  if (!/^[0-9a-fA-F-]{36}$/.test(id) || !isRecord(body)) return badRequest();
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!OBJECTIVE_KINDS.has(kind)) return badRequest();
  if (!isRecord(body.target)) return badRequest();
  try {
    const objectiveId = await deps.store.addObjective(id, kind, body.target);
    return NextResponse.json({ ok: true, objectiveId }, { status: 201 });
  } catch (e) {
    return toMissionAdminError(e);
  }
}
