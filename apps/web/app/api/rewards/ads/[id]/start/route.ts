/**
 * POST /api/rewards/ads/[id]/start — begin the provider experience.
 */
import { NextResponse } from "next/server";
import { handleStart, rewardedContext } from "../../_helper";

type Ctx = { params: { id: string } };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const c = await rewardedContext();
  if (c instanceof NextResponse) return c;
  return handleStart(ctx.params.id, c);
}
