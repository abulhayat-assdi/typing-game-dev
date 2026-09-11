import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  adminContext,
  inScope,
  readJson,
  toError,
} from "../../_helper";
import { ForbiddenError } from "../../../../../lib/server/staff-store";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const ac = await adminContext();
  if (ac instanceof NextResponse) return ac;
  try {
    const detail = await ac.store.getUserDetail(ctx.params.id);
    if (!detail) throw new ForbiddenError();
    const memberships = await ac.store.membershipsOf(ctx.params.id);
    const visible = memberships.filter((m) => inScope(ac.orgIds, m.organizationId));
    if (memberships.length > 0 && visible.length === 0) {
      throw new ForbiddenError();
    }
    return NextResponse.json({ detail, memberships: visible });
  } catch (e) {
    return toError(e);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const ac = await adminContext();
  if (ac instanceof NextResponse) return ac;
  const body = await readJson(req);
  try {
    if (!isRecord(body)) throw new ForbiddenError();
    if (body.op === "move" && typeof body.batchId === "string") {
      // Move = deactivate here + activate there is handled by membership ops;
      // this endpoint corrects the membership's batch directly (audited).
      const memberships = await ac.store.membershipsOf(ctx.params.id);
      const current = memberships.find((m) => m.isActive);
      if (!current || !inScope(ac.orgIds, current.organizationId)) {
        throw new ForbiddenError();
      }
      const target = await ac.store.batchInfo(body.batchId);
      if (!target || !inScope(ac.orgIds, target.organizationId)) {
        throw new ForbiddenError();
      }
      await ac.store.updateMembership(current.memberId, { batchId: body.batchId });
      return NextResponse.json({ ok: true });
    }
    if (body.op === "roll" && typeof body.rollNumber === "string" && body.rollNumber.trim()) {
      const memberships = await ac.store.membershipsOf(ctx.params.id);
      const current = memberships.find((m) => m.isActive);
      if (!current || !inScope(ac.orgIds, current.organizationId)) {
        throw new ForbiddenError();
      }
      await ac.store.updateMembership(current.memberId, {
        rollNumber: body.rollNumber.trim(),
      });
      return NextResponse.json({ ok: true });
    }
    if (body.op === "active" && typeof body.isActive === "boolean") {
      const memberships = await ac.store.membershipsOf(ctx.params.id);
      const current = memberships.find((m) => m.isActive);
      if (!current || !inScope(ac.orgIds, current.organizationId)) {
        throw new ForbiddenError();
      }
      await ac.store.updateMembership(current.memberId, { isActive: body.isActive });
      return NextResponse.json({ ok: true });
    }
    if (
      body.op === "status" &&
      (body.status === "active" || body.status === "inactive" || body.status === "suspended")
    ) {
      const memberships = await ac.store.membershipsOf(ctx.params.id);
      const scoped =
        memberships.length === 0 ||
        memberships.some((m) => inScope(ac.orgIds, m.organizationId));
      if (!scoped && ac.orgIds !== null) throw new ForbiddenError();
      await ac.store.updateAccountStatus(ctx.params.id, body.status);
      return NextResponse.json({ ok: true });
    }
    throw new ForbiddenError();
  } catch (e) {
    return toError(e);
  }
}
