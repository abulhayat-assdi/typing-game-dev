import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleStartMission, missionContext } from "../../_helper";

export async function POST(
  _req: NextRequest,
  ctx: { params: { instanceId: string } },
): Promise<Response> {
  const c = await missionContext();
  if (c instanceof NextResponse) return c;
  return handleStartMission(ctx.params.instanceId, c);
}
