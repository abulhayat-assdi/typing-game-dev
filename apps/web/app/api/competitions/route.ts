/**
 * GET /api/competitions — competitions visible to the caller (RLS-scoped).
 * POST /api/competitions — staff create a draft (teachers, admins, super).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  competitionContext,
  forbiddenActor,
  isRecord,
  isStaffActor,
  readJson,
  staffCompetitionContext,
  strField,
  toCompetitionError,
  uuidList,
  type CompetitionContext,
  type StaffCompetitionContext,
} from "./_helper";
import type { CompetitionDraftInput } from "../../../lib/server/competition-store";
import enErrors from "../../../messages/en/errors.json";

export const TYPES = new Set([
  "SOLO",
  "BATCH",
  "TIMED",
  "SCORE_ATTACK",
  "ACCURACY",
  "SPEED",
  "ENDURANCE",
  "MULTI_ROUND",
  "CLAN",
  "CLAN_WAR",
  "TOURNAMENT",
  "RELAY",
  "SEASONAL",
]);

const VISIBILITY = new Set(["public", "organization", "batch"]);
const ATTEMPT_POLICIES = new Set([
  "BEST_SCORE",
  "BEST_ACCURACY",
  "BEST_WPM",
  "LATEST_VALID",
  "AVERAGE_TOP_3",
]);

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: "MALFORMED", message }, { status: 400 });
}

export async function handleListCompetitions(
  deps: CompetitionContext,
): Promise<Response> {
  const competitions = await deps.store.listCompetitions(
    deps.session.userId,
  );
  return NextResponse.json({ competitions });
}

export async function handleCreateCompetition(
  body: unknown,
  deps: StaffCompetitionContext,
): Promise<Response> {
  if (!isStaffActor(deps.actor)) return forbiddenActor();
  if (!isRecord(body)) return badRequest(enErrors.malformedRequest);
  const slug = strField(body, "slug");
  const title = strField(body, "title");
  const type = strField(body, "type") || "SCORE_ATTACK";
  const visibility = strField(body, "visibility") || "batch";
  const attemptPolicy = strField(body, "attemptPolicy") || "BEST_SCORE";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return badRequest(enErrors.malformedRequest);
  }
  if (title.length < 1 || title.length > 160) {
    return badRequest(enErrors.malformedRequest);
  }
  if (!TYPES.has(type) || !VISIBILITY.has(visibility)) {
    return badRequest(enErrors.malformedRequest);
  }
  if (!ATTEMPT_POLICIES.has(attemptPolicy)) {
    return badRequest(enErrors.malformedRequest);
  }
  const batchIds = uuidList(body, "batchIds") ?? [];
  const courseIds = uuidList(body, "courseIds") ?? [];
  const gameSlugs =
    Array.isArray(body.gameSlugs) &&
    body.gameSlugs.every((g) => typeof g === "string" && g.length > 0)
      ? (body.gameSlugs as string[])
      : null;
  if (!gameSlugs || gameSlugs.length === 0) {
    return badRequest(enErrors.malformedRequest);
  }
  const attemptLimit =
    typeof body.attemptLimit === "number" &&
    Number.isInteger(body.attemptLimit) &&
    body.attemptLimit > 0
      ? body.attemptLimit
      : 5;
  const startsAt = strField(body, "startsAt");
  const endsAt = strField(body, "endsAt");
  if (!startsAt || !endsAt || Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
    return badRequest(enErrors.malformedRequest);
  }
  const input: CompetitionDraftInput = {
    slug,
    title,
    description: strField(body, "description"),
    type,
    visibility,
    batchIds,
    courseIds,
    skillBands: Array.isArray(body.skillBands)
      ? body.skillBands.filter((s): s is string => typeof s === "string")
      : [],
    gameSlugs,
    scoring: isRecord(body.scoring) ? body.scoring : { metric: "score" },
    attemptPolicy,
    attemptLimit,
    rewardPolicy: isRecord(body.rewardPolicy) ? body.rewardPolicy : {},
    startsAt,
    endsAt,
    registrationStartsAt: strField(body, "registrationStartsAt") || null,
    registrationEndsAt: strField(body, "registrationEndsAt") || null,
  };
  try {
    const id = await deps.store.createCompetition(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return toCompetitionError(e);
  }
}

export async function GET(): Promise<Response> {
  const ctx = await competitionContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListCompetitions(ctx);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await staffCompetitionContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleCreateCompetition(await readJson(req), ctx);
}
