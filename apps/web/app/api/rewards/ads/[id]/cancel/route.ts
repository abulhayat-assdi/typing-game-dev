/**
 * POST /api/rewards/ads/[id]/cancel — decline without penalty.
 */
import { NextResponse } from "next/server";
import { handleCancel, rewardedContext } from "../../_helper";

type Ctx = { params: { id: string } };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const c = await rewardedContext();
  if (c instanceof NextResponse) return c;
  return handleCancel(ctx.params.id, c);
}
