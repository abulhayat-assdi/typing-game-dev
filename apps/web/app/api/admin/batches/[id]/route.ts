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

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const ac = await adminContext();
  if (ac instanceof NextResponse) return ac;
  const body = await readJson(req);
  try {
    const info = await ac.store.batchInfo(ctx.params.id);
    if (!info || !inScope(ac.orgIds, info.organizationId)) {
      throw new ForbiddenError();
    }
    const patch: { name?: string; isActive?: boolean; joinCode?: string } = {};
    if (isRecord(body) && typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (isRecord(body) && typeof body.isActive === "boolean") {
      patch.isActive = body.isActive;
    }
    if (isRecord(body) && typeof body.joinCode === "string" && body.joinCode.trim()) {
      patch.joinCode = body.joinCode.trim();
    }
    await ac.store.updateBatch(ctx.params.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toError(e);
  }
}
