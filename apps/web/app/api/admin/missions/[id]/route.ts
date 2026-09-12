/**
 * PATCH /api/admin/missions/[id] — draft edits.
 * POST .../activate|deactivate, POST .../objectives.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleUpdateMission,
  missionAdminContext,
  readJson,
} from "../_helper";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await missionAdminContext();
  if (c instanceof NextResponse) return c;
  return handleUpdateMission(ctx.params.id, await readJson(req), c);
}
