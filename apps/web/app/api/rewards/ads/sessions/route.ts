/**
 * GET /api/rewards/ads/sessions — my recent sessions.
 */
import { NextResponse } from "next/server";
import { handleMySessions, rewardedContext } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await rewardedContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleMySessions(ctx);
}
