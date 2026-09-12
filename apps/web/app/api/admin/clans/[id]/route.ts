import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clanAdminContext,
  handleUpdateClan,
  readJson,
} from "../_helper";

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await clanAdminContext();
  if (c instanceof NextResponse) return c;
  return handleUpdateClan(ctx.params.id, await readJson(req), c);
}
