/**
 * GET /api/admin/adaptive/batch?batchId= — batch attention + aggregates.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  adaptiveStaffContext,
  handleBatchSummary,
  validUuid,
} from "../_helper";

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await adaptiveStaffContext();
  if (ctx instanceof NextResponse) return ctx;
  const batchId = new URL(req.url).searchParams.get("batchId") ?? "";
  if (!validUuid(batchId)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return handleBatchSummary(batchId, ctx);
}
