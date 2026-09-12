/**
 * GET /api/adaptive — cached learner summary (profile, trends,
 * weaknesses, recommendations, difficulty).
 */
import { NextResponse } from "next/server";
import { adaptiveContext, handleGetSummary } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await adaptiveContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetSummary(ctx);
}
