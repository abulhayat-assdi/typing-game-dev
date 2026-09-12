import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleAdvance, warContext } from "../../_helper";

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await warContext();
  if (c instanceof NextResponse) return c;
  return handleAdvance(ctx.params.id, c);
}
