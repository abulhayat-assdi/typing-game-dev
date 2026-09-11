/**
 * POST /api/games/[gameId]/attempts/[attemptId]/submit
 *
 * Trust model: the client sends raw evidence (typed text, elapsed time,
 * correction counts). The server recomputes correctness from its stored
 * prompt snapshot, derives accuracy/WPM itself, validates plausibility, and
 * persists via the atomic fn_submit_attempt. Client-claimed WPM/accuracy/
 * score are cross-checked when present, never trusted.
 *
 * Responses: 200 {status: validated|rejected, ...} · 400 malformed ·
 * 401 anonymous · 404 unknown/foreign/mismatched · 409 already finalized ·
 * 410 expired · 429/500 store failures.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  computeRawMetrics,
  computeScore,
} from "@tap/scoring";
import { diffExpected, isTerminal, validateSubmission } from "@tap/game-engine";
import { getSession, unauthorized, type Session } from "../../../../../../../lib/server/auth";
import { userDbClient } from "../../../../../../../lib/server/auth";
import {
  createSupabaseAttemptStore,
  type AttemptStore,
} from "../../../../../../../lib/server/attempt-store";
import enErrors from "../../../../../../../messages/en/errors.json";

export interface SubmitDeps {
  session: Session | null;
  store: AttemptStore | null;
}

function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleSubmitAttempt(
  gameSlug: string,
  attemptId: string,
  body: unknown,
  deps: SubmitDeps,
): Promise<Response> {
  if (!deps.session) return unauthorized(enErrors.unauthorizedDescription);
  if (!deps.store) {
    return fail("SERVICE_UNAVAILABLE", enErrors.storageUnavailable, 503);
  }
  if (!isRecord(body) || typeof body.typedText !== "string") {
    return fail("MALFORMED_SUBMISSION", enErrors.requiredField, 400);
  }
  const typedChars = Array.from(body.typedText);
  const elapsedMs = typeof body.elapsedMs === "number" ? body.elapsedMs : NaN;
  const corrections =
    typeof body.corrections === "number" ? Math.floor(body.corrections) : 0;
  const errorStrokes =
    typeof body.errorStrokes === "number" ? Math.floor(body.errorStrokes) : 0;
  const claimedAccuracy =
    typeof body.claimedAccuracy === "number" ? body.claimedAccuracy : undefined;
  const claimedWpm =
    typeof body.claimedWpm === "number" ? body.claimedWpm : undefined;

  const attempt = await deps.store.getAttempt(attemptId);
  if (!attempt || attempt.userId !== deps.session.userId || attempt.gameSlug !== gameSlug) {
    // One opaque 404: no existence oracle, no owner oracle, no game oracle.
    return fail("ATTEMPT_NOT_FOUND", enErrors.fileNotAvailable, 404);
  }
  if (isTerminal(attempt.status)) {
    return fail("ALREADY_FINALIZED", enErrors.storageUnavailable, 409);
  }

  const expectedChars = Array.from(attempt.expectedText);
  const diff = diffExpected(attempt.expectedText, body.typedText);
  const metrics = computeRawMetrics({
    correctChars: diff.correctChars,
    typedLength: typedChars.length,
    errorStrokes,
    corrections,
    elapsedMs,
    expectedLength: expectedChars.length,
  });
  const verdict = validateSubmission(
    {
      expectedLength: expectedChars.length,
      typedLength: typedChars.length,
      correctChars: diff.correctChars,
      corrections,
      elapsedMs,
      claimedAccuracy,
      claimedWpm,
    },
    {},
  );

  if (
    !verdict.ok &&
    (verdict.rejectReason === "INVALID_EVIDENCE" || typedChars.length === 0)
  ) {
    return fail("MALFORMED_SUBMISSION", enErrors.requiredField, 400);
  }

  const score = verdict.ok
    ? computeScore(metrics, attempt.scoringProfile)
    : { score: 0, profileId: attempt.scoringProfile };

  try {
    const status = await deps.store.submitAttempt({
      attemptId: attempt.id,
      raw: {
        durationMs: metrics.durationMs,
        totalCharacters: metrics.totalCharacters,
        correctCharacters: metrics.correctCharacters,
        incorrectCharacters: metrics.incorrectCharacters,
        correctedCharacters: metrics.correctedCharacters,
        errorStrokes: metrics.errorStrokes,
        completedWords: metrics.completedWords,
        accuracy: metrics.accuracy,
        rawWpm: metrics.rawWpm,
        effectiveWpm: metrics.effectiveWpm,
        completion: metrics.completion,
        flags: verdict.flags,
      },
      score: score.score,
      accuracy: metrics.accuracy,
      effectiveWpm: metrics.effectiveWpm,
      valid: verdict.ok,
      reason: verdict.ok ? null : (verdict.rejectReason ?? "REJECTED"),
    });
    return NextResponse.json({
      status,
      score: score.score,
      accuracy: metrics.accuracy,
      effectiveWpm: metrics.effectiveWpm,
      reason: verdict.ok ? null : verdict.rejectReason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SUBMIT_FAILED";
    if (message.includes("ALREADY_FINALIZED")) {
      return fail("ALREADY_FINALIZED", enErrors.storageUnavailable, 409);
    }
    if (message.includes("ATTEMPT_EXPIRED")) {
      return fail("ATTEMPT_EXPIRED", enErrors.storageUnavailable, 410);
    }
    if (message.includes("NOT_OWNER") || message.includes("ATTEMPT_NOT_FOUND")) {
      return fail("ATTEMPT_NOT_FOUND", enErrors.fileNotAvailable, 404);
    }
    return fail("SUBMIT_FAILED", enErrors.storageUnavailable, 500);
  }
}

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: { gameId: string; attemptId: string } },
): Promise<Response> {
  const session = await getSession();
  const client = await userDbClient();
  return handleSubmitAttempt(
    ctx.params.gameId,
    ctx.params.attemptId,
    await readBody(req),
    {
      session,
      store: client ? createSupabaseAttemptStore(client) : null,
    },
  );
}
