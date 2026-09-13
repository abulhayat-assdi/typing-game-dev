/**
 * GET /api/rewards/ads/catalog — reward allow-list + public policy.
 */
import { NextResponse } from "next/server";
import { handleCatalog, rewardedContext } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await rewardedContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleCatalog(ctx);
}
