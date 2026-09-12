/**
 * POST /api/bosses/[instanceId]/submit — deal damage with one attempt.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bossContext, handleSubmitBoss, readJson } from "../../_helper";

export async function POST(
  req: NextRequest,
  ctx: { params: { instanceId: string } },
): Promise<Response> {
  const c = await bossContext();
  if (c instanceof NextResponse) return c;
  return handleSubmitBoss(ctx.params.instanceId, await readJson(req), c);
}
