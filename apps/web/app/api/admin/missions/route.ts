/**
 * GET /api/admin/missions — all definitions incl. drafts.
 * POST /api/admin/missions — create draft with objectives.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleCreateMission,
  handleListMissions,
  missionAdminContext,
  readJson,
} from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await missionAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListMissions(ctx);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await missionAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleCreateMission(await readJson(req), ctx);
}
