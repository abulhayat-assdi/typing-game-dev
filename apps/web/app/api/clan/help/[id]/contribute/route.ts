import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clanContext, handleContributeHelp, readJson } from "../../../_helper";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await clanContext();
  if (c instanceof NextResponse) return c;
  return handleContributeHelp(ctx.params.id, await readJson(req), c);
}
