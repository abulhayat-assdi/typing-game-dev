/**
 * POST /api/rewards/ads/offer — eligibility-checked opportunity.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleOffer, readJson, rewardedContext } from "../_helper";

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await rewardedContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleOffer(await readJson(req), ctx);
}
