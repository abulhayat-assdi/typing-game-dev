/**
 * Season admin gate (M13). M7 adminContext for roles, then a SeasonStore.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseSeasonStore,
  type SeasonCreateInput,
  type SeasonStore,
} from "../../../../lib/server/season-store";
import { adminContext } from "../_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface SeasonAdminDeps {
  actor: Actor;
  store: SeasonStore;
}

export function isSeasonAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

function forbiddenSeason(): NextResponse {
  return NextResponse.json(
    { error: "FORBIDDEN", message: enErrors.permissionDenied },
    { status: 403 },
  );
}

export function toSeasonAdminError(e: unknown): NextResponse {
  if (e instanceof ForbiddenError) return forbiddenSeason();
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

export async function seasonAdminContext(): Promise<
  SeasonAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isSeasonAdminActor(ctx.actor)) return forbiddenSeason();
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseSeasonStore(client) };
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

export async function handleListSeasons(
  deps: SeasonAdminDeps,
): Promise<Response> {
  if (!isSeasonAdminActor(deps.actor)) return forbiddenSeason();
  return NextResponse.json({ seasons: await deps.store.listSeasons() });
}

export async function handleCreateSeason(
  body: unknown,
  deps: SeasonAdminDeps,
): Promise<Response> {
  if (!isSeasonAdminActor(deps.actor)) return forbiddenSeason();
  if (!isRecord(body)) return badRequest();
  const slug = strField(body, "slug");
  const name = strField(body, "name");
  const startAt = strField(body, "startAt");
  const endAt = strField(body, "endAt");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return badRequest();
  if (name.length < 1 || name.length > 160) return badRequest();
  if (
    !startAt || !endAt ||
    Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(endAt)) ||
    Date.parse(endAt) <= Date.parse(startAt)
  ) {
    return badRequest();
  }
  const input: SeasonCreateInput = {
    slug,
    name,
    description: strField(body, "description"),
    theme: strField(body, "theme"),
    startAt,
    endAt,
  };
  try {
    const id = await deps.store.createSeason(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toSeasonAdminError(e);
  }
}

export async function handleSeasonAction(
  id: string,
  action: string,
  body: unknown,
  deps: SeasonAdminDeps,
): Promise<Response> {
  if (!isSeasonAdminActor(deps.actor)) return forbiddenSeason();
  if (!validUuid(id)) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  try {
    switch (action) {
      case "schedule":
        await deps.store.scheduleSeason(id);
        break;
      case "activate":
        await deps.store.activateSeason(id);
        break;
      case "cancel":
        await deps.store.cancelSeason(id);
        break;
      case "advance":
        return NextResponse.json({
          status: await deps.store.advanceSeason(id),
        });
      case "source":
        if (!isRecord(body) || typeof body.source !== "string") {
          return badRequest();
        }
        await deps.store.setSource(id, body.source, body.enabled !== false);
        break;
      case "tier":
        if (!isRecord(body) || typeof body.tier !== "string") {
          return badRequest();
        }
        await deps.store.setTier(
          id,
          body.tier,
          typeof body.minPoints === "number" ? Math.floor(body.minPoints) : 0,
        );
        break;
      case "update":
        if (!isRecord(body)) return badRequest();
        await deps.store.updateSeasonDraft(
          id,
          isRecord(body.patch) ? body.patch : {},
        );
        break;
      default:
        return NextResponse.json(
          { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
          { status: 404 },
        );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toSeasonAdminError(e);
  }
}
