/**
 * GET /api/competitions/[id]/results â€” finalized/own result rows.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { competitionContext, handleResults } from "../../_helper";

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await competitionContext();
  if (c instanceof NextResponse) return c;
  return handleResults(ctx.params.id, c);
}
