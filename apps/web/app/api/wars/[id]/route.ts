/**
 * GET /api/wars/[id] — detail. POST .../dispatch|accept|cancel|advance|
 * submit|sync|finalize, GET .../board.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleGetWar, warContext } from "../_helper";

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await warContext();
  if (c instanceof NextResponse) return c;
  return handleGetWar(ctx.params.id, c);
}
