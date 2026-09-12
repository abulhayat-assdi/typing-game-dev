/**
 * POST /api/missions/sync — recompute progress from validated attempts,
 * award once, return the refreshed set.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleSyncMissions, missionContext } from "../_helper";

export async function POST(_req: NextRequest): Promise<Response> {
  const ctx = await missionContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleSyncMissions(ctx);
}
