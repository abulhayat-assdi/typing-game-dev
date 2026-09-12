/**
 * GET /api/tournaments/[id]/board — bracket rounds plus final results.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleTournamentBoard, tournamentContext } from "../../_helper";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await tournamentContext();
  if (c instanceof NextResponse) return c;
  return handleTournamentBoard(ctx.params.id, c);
}
