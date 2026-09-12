/**
 * GET /api/admin/seasons — all definitions. POST — create draft.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleCreateSeason,
  handleListSeasons,
  readJson,
  seasonAdminContext,
} from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await seasonAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListSeasons(ctx);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await seasonAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleCreateSeason(await readJson(req), ctx);
}
