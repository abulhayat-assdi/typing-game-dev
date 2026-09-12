/**
 * Tournament admin gate (M14). M7 adminContext for roles, then a
 * TournamentStore. Organization isolation is enforced in SQL
 * (fn_require_tournament_admin); the route gate keeps students and
 * teachers out entirely.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  createSupabaseTournamentStore,
  type TournamentCreateInput,
  type TournamentStore,
} from "../../../../lib/server/tournament-store";
import { adminContext } from "../_helper";
import { isRecord, toTournamentError } from "../../tournaments/_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface TournamentAdminDeps {
  actor: Actor;
  store: TournamentStore;
}

export function isTournamentAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

function forbiddenTournament(): NextResponse {
  return NextResponse.json(
    { error: "FORBIDDEN", message: enErrors.permissionDenied },
    { status: 403 },
  );
}

export async function tournamentAdminContext(): Promise<
  TournamentAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isTournamentAdminActor(ctx.actor)) return forbiddenTournament();
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseTournamentStore(client) };
}

export function strField(body: unknown, key: string): string {
  if (!isRecord(body)) return "";
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

function optField(body: unknown, key: string): string | null {
  const v = strField(body, key);
  return v.length > 0 ? v : null;
}

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

export function validUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

export async function handleListTournaments(
  deps: TournamentAdminDeps,
): Promise<Response> {
  if (!isTournamentAdminActor(deps.actor)) return forbiddenTournament();
  try {
    return NextResponse.json({
      tournaments: await deps.store.listTournaments(),
    });
  } catch (e) {
    return toTournamentError(e);
  }
}

export async function handleCreateTournament(
  body: unknown,
  deps: TournamentAdminDeps,
): Promise<Response> {
  if (!isTournamentAdminActor(deps.actor)) return forbiddenTournament();
  if (!isRecord(body)) return badRequest();
  const slug = strField(body, "slug");
  const name = strField(body, "name");
  const format = strField(body, "format") || "single_elimination";
  const participantType = strField(body, "participantType");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return badRequest();
  if (name.length < 1 || name.length > 160) return badRequest();
  if (format !== "single_elimination") return badRequest();
  if (participantType !== "clan" && participantType !== "student") {
    return badRequest();
  }
  const input: TournamentCreateInput = {
    slug,
    name,
    description: strField(body, "description"),
    theme: strField(body, "theme"),
    format,
    participantType,
    startAt: optField(body, "startAt"),
    endAt: optField(body, "endAt"),
  };
  try {
    const id = await deps.store.createTournament(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toTournamentError(e);
  }
}

function numField(body: unknown, key: string): number | null {
  if (!isRecord(body)) return null;
  const v = body[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function handleTournamentAction(
  id: string,
  action: string,
  body: unknown,
  deps: TournamentAdminDeps,
): Promise<Response> {
  if (!isTournamentAdminActor(deps.actor)) return forbiddenTournament();
  if (!validUuid(id)) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  try {
    switch (action) {
      case "update":
        await deps.store.updateTournamentDraft(
          id,
          isRecord(body) ? body : {},
        );
        return NextResponse.json({ ok: true });
      case "publish":
        await deps.store.publishTournament(id);
        return NextResponse.json({ ok: true });
      case "close":
        await deps.store.closeRegistration(id);
        return NextResponse.json({ ok: true });
      case "cancel":
        await deps.store.cancelTournament(id);
        return NextResponse.json({ ok: true });
      case "seed": {
        if (!isRecord(body)) return badRequest();
        const method = strField(body, "method") || "manual";
        if (method !== "manual" && method !== "random" && method !== "season_ranking") {
          return badRequest();
        }
        let order: string[] | undefined;
        if ("order" in body) {
          const v: unknown = body.order;
          if (
            !Array.isArray(v) ||
            !v.every((x): x is string => typeof x === "string" && validUuid(x))
          ) {
            return badRequest();
          }
          order = [...v];
        } else if (method === "manual") {
          return badRequest();
        }
        const seeded = await deps.store.seedTournament(
          id,
          method,
          order,
          numField(body, "seed") ?? undefined,
        );
        return NextResponse.json({ ok: true, seeded });
      }
      case "start":
        await deps.store.startTournament(id);
        return NextResponse.json({ ok: true });
      case "open": {
        const matchId = strField(body, "matchId");
        if (!validUuid(matchId)) return badRequest();
        await deps.store.openMatch(matchId);
        return NextResponse.json({ ok: true });
      }
      case "finalize-match": {
        const matchId = strField(body, "matchId");
        const scoreA = numField(body, "scoreA");
        const scoreB = numField(body, "scoreB");
        if (!validUuid(matchId) || scoreA === null || scoreB === null) {
          return badRequest();
        }
        const metrics =
          isRecord(body) && isRecord(body.metrics) ? body.metrics : undefined;
        const winnerId = await deps.store.finalizeMatch(
          matchId,
          scoreA,
          scoreB,
          metrics,
        );
        return NextResponse.json({ ok: true, winnerId });
      }
      case "advance": {
        const status = await deps.store.advanceTournament(id);
        return NextResponse.json({ ok: true, status });
      }
      case "finalize": {
        const result = await deps.store.finalizeTournament(id);
        return NextResponse.json({ ok: true, ...result });
      }
      case "sync": {
        const seasonId = strField(body, "seasonId");
        if (!validUuid(seasonId)) return badRequest();
        const events = await deps.store.syncSeason(id, seasonId);
        return NextResponse.json({ ok: true, events });
      }
      default:
        return NextResponse.json(
          { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
          { status: 404 },
        );
    }
  } catch (e) {
    return toTournamentError(e);
  }
}
