/**
 * POST /api/rewards/ads/[id]/complete — provider reference echoed
 * back; server validates, verifies, and grants exactly once.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleComplete, readJson, rewardedContext } from "../../_helper";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await rewardedContext();
  if (c instanceof NextResponse) return c;
  return handleComplete(ctx.params.id, await readJson(req), c);
}
