/**
 * GET /api/missions — today's set (assign + sync + read, idempotent).
 * POST /api/missions/sync — recompute progress, award once, return set.
 */
import { NextResponse } from "next/server";
import { handleGetMissions, missionContext } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await missionContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetMissions(ctx);
}
