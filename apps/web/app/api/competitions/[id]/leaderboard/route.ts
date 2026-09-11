/**
 * GET /api/competitions/[id]/leaderboard â€” server-derived board.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { competitionContext, handleLeaderboard } from "../../_helper";

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await competitionContext();
  if (c instanceof NextResponse) return c;
  return handleLeaderboard(ctx.params.id, c);
}
