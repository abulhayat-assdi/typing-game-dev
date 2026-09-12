import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bossAdminContext, handleBossStatus } from "../../_helper";

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await bossAdminContext();
  if (c instanceof NextResponse) return c;
  return handleBossStatus(ctx.params.id, "inactive", c);
}
