import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import { requireSuperAdmin } from "../../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { ForbiddenError } from "../../../../../lib/server/staff-store";
import { adminContext, readJson, toError } from "../../_helper";
import { AuthApiError } from "../../../../../lib/server/staff";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function superStore(): Promise<
  | { store: ReturnType<typeof createSupabaseStaffStore> }
  | NextResponse
> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
  try {
    await requireSuperAdmin(client);
    return { store: createSupabaseStaffStore(client) };
  } catch (e) {
    return toError(e instanceof AuthApiError ? e : new AuthApiError(403, "FORBIDDEN"));
  }
}

export async function GET(_req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    if (ctx.orgIds !== null) throw new ForbiddenError();
    const flags = await ctx.store.getFlags();
    const orgs = await ctx.store.listOrgs();
    return NextResponse.json({ flags, orgs });
  } catch (e) {
    return toError(e);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { key: string } },
): Promise<Response> {
  const s = await superStore();
  if (s instanceof NextResponse) return s;
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.enabled !== "boolean") {
    return toError(new Error("MALFORMED"));
  }
  try {
    await s.store.setFlag(ctx.params.key, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toError(e);
  }
}
