import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleAddObjective,
  missionAdminContext,
  readJson,
} from "../../_helper";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await missionAdminContext();
  if (c instanceof NextResponse) return c;
  return handleAddObjective(ctx.params.id, await readJson(req), c);
}
