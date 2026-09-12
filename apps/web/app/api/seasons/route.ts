/**
 * GET /api/seasons — visible seasons.
 */
import { NextResponse } from "next/server";
import { handleListSeasons, seasonContext } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await seasonContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListSeasons(ctx);
}
