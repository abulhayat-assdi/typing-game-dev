/**
 * GET /api/admin/adaptive/global — effectiveness + content signals.
 */
import { NextResponse } from "next/server";
import { adaptiveStaffContext, handleGlobalSummary } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await adaptiveStaffContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGlobalSummary(ctx);
}
