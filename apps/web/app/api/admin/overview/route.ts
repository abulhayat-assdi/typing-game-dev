import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminContext, toError } from "../_helper";
import { getAdminOverview } from "../../../../lib/server/staff-data";

/** Admin overview counts (org-scoped, RLS-filtered underneath). */
export async function GET(_req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const overview = await getAdminOverview(ctx.orgIds, ctx.store);
    return NextResponse.json(overview);
  } catch (e) {
    return toError(e);
  }
}
