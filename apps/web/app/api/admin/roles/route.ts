import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  adminContext,
  inScope,
  readJson,
  strField,
  toError,
} from "../_helper";
import { ForbiddenError } from "../../../../lib/server/staff-store";

const GRANTABLE = ["teacher", "student"] as const;

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson(req);
  const userId = strField(body, "userId");
  const role = strField(body, "role");
  const organizationId = strField(body, "organizationId") || undefined;
  if (!userId || !role) return toError(new Error("MALFORMED"));
  try {
    // Org admins may only move users between teacher/student; anything else
    // (and all admin grants) is enforced inside fn_grant_role. Belt first:
    if (
      ctx.orgIds !== null &&
      (!(GRANTABLE as readonly string[]).includes(role) || organizationId)
    ) {
      throw new ForbiddenError();
    }
    if (organizationId && !inScope(ctx.orgIds, organizationId)) {
      throw new ForbiddenError();
    }
    await ctx.store.grantRole(userId, role, organizationId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return toError(e);
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson(req);
  const userId = strField(body, "userId");
  const role = strField(body, "role");
  if (!userId || !role) return toError(new Error("MALFORMED"));
  try {
    if (
      ctx.orgIds !== null &&
      !(GRANTABLE as readonly string[]).includes(role)
    ) {
      throw new ForbiddenError();
    }
    await ctx.store.revokeRole(userId, role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toError(e);
  }
}
