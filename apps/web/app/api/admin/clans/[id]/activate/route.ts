import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clanAdminContext, handleClanStatus } from "../../_helper";

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await clanAdminContext();
  if (c instanceof NextResponse) return c;
  return handleClanStatus(ctx.params.id, "active", c);
}
