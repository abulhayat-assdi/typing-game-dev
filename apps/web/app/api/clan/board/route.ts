import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clanContext, handleGetBoard } from "../_helper";

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await clanContext();
  if (ctx instanceof NextResponse) return ctx;
  const window = new URL(req.url).searchParams.get("window") ?? "all";
  return handleGetBoard(window, ctx);
}
