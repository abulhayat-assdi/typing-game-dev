/**
 * POST /api/adaptive/refresh — recompute my cached profile on demand.
 */
import { NextResponse } from "next/server";
import { adaptiveContext, handleRefresh } from "../_helper";

export async function POST(): Promise<Response> {
  const ctx = await adaptiveContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleRefresh(ctx);
}
