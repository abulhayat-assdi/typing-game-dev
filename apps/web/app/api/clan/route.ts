/**
 * GET /api/clan — my clan dashboard bundle.
 * GET /api/clan/members — roster. GET /api/clan/board?window= — board.
 * GET /api/clan/missions — clan runs. GET /api/clan/help — help board.
 */
import { NextResponse } from "next/server";
import { clanContext, handleGetClan } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await clanContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetClan(ctx);
}
