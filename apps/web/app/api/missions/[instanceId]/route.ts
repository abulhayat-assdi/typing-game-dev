/**
 * GET /api/missions/[instanceId] — one instance (opaque 404).
 * POST /api/missions/[instanceId]/start — available → active.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleGetMission,
  missionContext,
} from "../_helper";

type Ctx = { params: { instanceId: string } };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await missionContext();
  if (c instanceof NextResponse) return c;
  return handleGetMission(ctx.params.instanceId, c);
}
