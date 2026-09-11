/**
 * GET /api/competitions/[id] — detail + own entry (RLS-scoped, opaque 404).
 * PATCH /api/competitions/[id] — staff edit of draft fields only.
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
  type CompetitionContext,
  type StaffCompetitionContext,
} from "../_helper";
import type { DraftPatch } from "../../../../lib/server/competition-store";
import enErrors from "../../../../messages/en/errors.json";

const ATTEMPT_POLICIES = new Set([
  "BEST_SCORE",
  "BEST_ACCURACY",
  "BEST_WPM",
  "LATEST_VALID",
  "AVERAGE_TOP_3",
]);

export async function handleGetCompetition(
  id: string,
  deps: CompetitionContext,
): Promise<Response> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  const competition = await deps.store.getCompetition(id, deps.session.userId);
  if (!competition) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  return NextResponse.json({ competition });
}

export async function handleUpdateDraft(
  id: string,
  body: unknown,
  deps: StaffCompetitionContext,
): Promise<Response> {
  if (!isStaffActor(deps.actor)) return forbiddenActor();
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const patch: DraftPatch = {};
  const title = strField(body, "title");
  if (title) {
    if (title.length > 160) {
      return NextResponse.json(
        { error: "MALFORMED", message: enErrors.malformedRequest },
        { status: 400 },
      );
    }
    patch.title = title;
  }
  if (typeof body.description === "string") {
    patch.description = body.description;
  }
  const attemptPolicy = strField(body, "attemptPolicy");
  if (attemptPolicy) {
    if (!ATTEMPT_POLICIES.has(attemptPolicy)) {
      return NextResponse.json(
        { error: "MALFORMED", message: enErrors.malformedRequest },
        { status: 400 },
      );
    }
    patch.attemptPolicy = attemptPolicy;
  }
  if (typeof body.attemptLimit === "number") {
    if (!Number.isInteger(body.attemptLimit) || body.attemptLimit <= 0) {
      return NextResponse.json(
        { error: "MALFORMED", message: enErrors.malformedRequest },
        { status: 400 },
      );
    }
    patch.attemptLimit = body.attemptLimit;
  }
  if (isRecord(body.rewardPolicy)) patch.rewardPolicy = body.rewardPolicy;
  if (isRecord(body.scoring)) patch.scoring = body.scoring;
  if (isRecord(body.eligibility)) patch.eligibility = body.eligibility;
  const startsAt = strField(body, "startsAt");
  if (startsAt) {
    if (Number.isNaN(Date.parse(startsAt))) {
      return NextResponse.json(
        { error: "MALFORMED", message: enErrors.malformedRequest },
        { status: 400 },
      );
    }
    patch.startsAt = startsAt;
  }
  const endsAt = strField(body, "endsAt");
  if (endsAt) {
    if (Number.isNaN(Date.parse(endsAt))) {
      return NextResponse.json(
        { error: "MALFORMED", message: enErrors.malformedRequest },
        { status: 400 },
      );
    }
    patch.endsAt = endsAt;
  }
  if (Array.isArray(body.gameSlugs)) {
    if (
      body.gameSlugs.length === 0 ||
      !body.gameSlugs.every((g) => typeof g === "string" && g.length > 0)
    ) {
      return NextResponse.json(
        { error: "MALFORMED", message: enErrors.malformedRequest },
        { status: 400 },
      );
    }
    patch.gameSlugs = body.gameSlugs as string[];
  }
  try {
    await deps.store.updateDraft(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toCompetitionError(e);
  }
}

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await competitionContext();
  if (c instanceof NextResponse) return c;
  return handleGetCompetition(ctx.params.id, c);
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await staffCompetitionContext();
  if (c instanceof NextResponse) return c;
  return handleUpdateDraft(ctx.params.id, await readJson(req), c);
}
