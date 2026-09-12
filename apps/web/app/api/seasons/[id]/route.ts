/**
 * GET /api/seasons/[id] — detail with boards. GET .../board?type= — board.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleGetSeason, seasonContext } from "../_helper";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await seasonContext();
  if (c instanceof NextResponse) return c;
  return handleGetSeason(ctx.params.id, c);
}
