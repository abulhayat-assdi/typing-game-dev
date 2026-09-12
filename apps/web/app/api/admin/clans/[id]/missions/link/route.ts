import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clanAdminContext,
  handleLinkMission,
  readJson,
} from "../../../_helper";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await clanAdminContext();
  if (c instanceof NextResponse) return c;
  return handleLinkMission(ctx.params.id, await readJson(req), c);
}
