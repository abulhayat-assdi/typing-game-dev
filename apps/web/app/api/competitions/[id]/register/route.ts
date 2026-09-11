/**
 * POST /api/competitions/[id]/register â€” caller joins the competition.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { competitionContext, handleRegister } from "../../_helper";

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await competitionContext();
  if (c instanceof NextResponse) return c;
  return handleRegister(ctx.params.id, c);
}
