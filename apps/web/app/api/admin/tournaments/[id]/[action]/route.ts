/**
 * POST /api/admin/tournaments/[id]/[action] — tournament orchestration.
 * Actions: update, publish, close, cancel, seed, start, open,
 * finalize-match, advance, finalize, sync.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleTournamentAction,
  readJson,
  tournamentAdminContext,
} from "../../_helper";

const ACTIONS = new Set([
  "update",
  "publish",
  "close",
  "cancel",
  "seed",
  "start",
  "open",
  "finalize-match",
  "advance",
  "finalize",
  "sync",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string; action: string } },
): Promise<Response> {
  const c = await tournamentAdminContext();
  if (c instanceof NextResponse) return c;
  if (!ACTIONS.has(ctx.params.action)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return handleTournamentAction(
    ctx.params.id,
    ctx.params.action,
    await readJson(req),
    c,
  );
}
