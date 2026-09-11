/**
 * GET /api/games/[gameId]/attempts/[attemptId]
 *
 * Owners read their attempt summary (+ result once terminal). Anything else
 * is an opaque 404 — no existence, owner, or game-mismatch oracle.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isTerminal } from "@tap/game-engine";
import { getSession, unauthorized, type Session } from "../../../../../../lib/server/auth";
import { userDbClient } from "../../../../../../lib/server/auth";
import {
  createSupabaseAttemptStore,
  type AttemptStore,
} from "../../../../../../lib/server/attempt-store";
import enErrors from "../../../../../../messages/en/errors.json";

export interface GetAttemptDeps {
  session: Session | null;
  store: AttemptStore | null;
}

export async function handleGetAttempt(
  gameSlug: string,
  attemptId: string,
  deps: GetAttemptDeps,
): Promise<Response> {
  if (!deps.session) return unauthorized(enErrors.unauthorizedDescription);
  if (!deps.store) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  const attempt = await deps.store.getAttempt(attemptId);
  if (
    !attempt ||
    attempt.userId !== deps.session.userId ||
    attempt.gameSlug !== gameSlug
  ) {
    return NextResponse.json(
      { error: "ATTEMPT_NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  const result = isTerminal(attempt.status)
    ? await deps.store.getResult(attempt.id)
    : null;
  return NextResponse.json({
    attempt: {
      id: attempt.id,
      gameSlug: attempt.gameSlug,
      difficulty: attempt.difficulty,
      status: attempt.status,
      expectedText: attempt.expectedText,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      finalizedAt: attempt.finalizedAt,
    },
    result,
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { gameId: string; attemptId: string } },
): Promise<Response> {
  const session = await getSession();
  const client = await userDbClient();
  return handleGetAttempt(ctx.params.gameId, ctx.params.attemptId, {
    session,
    store: client ? createSupabaseAttemptStore(client) : null,
  });
}
