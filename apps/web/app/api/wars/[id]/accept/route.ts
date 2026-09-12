import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleRespond, readJson, warContext } from "../../_helper";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await warContext();
  if (c instanceof NextResponse) return c;
  return handleRespond(ctx.params.id, await readJson(req), c);
}
