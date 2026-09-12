/**
 * GET /api/admin/bosses — all definitions. POST — create draft + phases.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  bossAdminContext,
  handleCreateBoss,
  handleListBosses,
  readJson,
} from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await bossAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListBosses(ctx);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await bossAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleCreateBoss(await readJson(req), ctx);
}
