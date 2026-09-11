/**
 * GET /api/games/[gameId]/records — own personal bests for one game.
 * Read-only, RLS-filtered, opaque 404s. Used by the result screen to flag
 * new personal bests without ever computing them client-side.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession, unauthorized, type Session } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import {
  createSupabaseStudentStore,
  type StudentStore,
} from "../../../../../lib/server/student-store";
import enErrors from "../../../../../messages/en/errors.json";

export interface RecordsDeps {
  session: Session | null;
  store: StudentStore | null;
}

export async function handleGetRecords(
  gameSlug: string,
  deps: RecordsDeps,
): Promise<Response> {
  if (!deps.session) return unauthorized(enErrors.unauthorizedDescription);
  if (!deps.store) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  const game = await deps.store.getGame(gameSlug);
  if (!game) {
    return NextResponse.json(
      { error: "GAME_NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  const records = await deps.store.getPersonalBests(gameSlug, deps.session.userId);
  return NextResponse.json({ gameSlug, records });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { gameId: string } },
): Promise<Response> {
  const session = await getSession();
  const client = await userDbClient();
  return handleGetRecords(ctx.params.gameId, {
    session,
    store: client ? createSupabaseStudentStore(client) : null,
  });
}
