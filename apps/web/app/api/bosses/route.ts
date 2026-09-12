/**
 * GET /api/bosses — definitions + my clan instances.
 */
import { NextResponse } from "next/server";
import { bossContext, handleListBosses } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await bossContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListBosses(ctx);
}
