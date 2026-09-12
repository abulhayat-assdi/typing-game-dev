/**
 * GET /api/adaptive/practice — personal practice plan: top
 * recommendation, content-engine drill for weak keys, quick actions.
 */
import { NextResponse } from "next/server";
import { adaptiveContext, handlePracticePlan } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await adaptiveContext();
  if (ctx instanceof NextResponse) return ctx;
  return handlePracticePlan(ctx);
}
