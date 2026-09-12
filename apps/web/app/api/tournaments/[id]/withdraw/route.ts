/**
 * POST /api/tournaments/[id]/withdraw — withdrawal before the roster
 * locks at seeding.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleWithdraw,
  readJson,
  tournamentContext,
} from "../../_helper";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await tournamentContext();
  if (c instanceof NextResponse) return c;
  return handleWithdraw(ctx.params.id, await readJson(req), c);
}
