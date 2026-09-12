/**
 * POST /api/adaptive/feedback — report recommendation outcomes
 * (shown/started/completed/abandoned/skipped). Scores stay server-side.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adaptiveContext, handleFeedback, readJson } from "../_helper";

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await adaptiveContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleFeedback(await readJson(req), ctx);
}
