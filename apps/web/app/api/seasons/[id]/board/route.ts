import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleSeasonBoard, seasonContext } from "../../_helper";

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const c = await seasonContext();
  if (c instanceof NextResponse) return c;
  const type = new URL(req.url).searchParams.get("type") ?? "student";
  return handleSeasonBoard(ctx.params.id, type, c);
}
