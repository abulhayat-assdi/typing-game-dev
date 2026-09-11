import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminContext, toError } from "../../_helper";
import { ForbiddenError } from "../../../../../lib/server/staff-store";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  const ac = await adminContext();
  if (ac instanceof NextResponse) return ac;
  try {
    const all = await ac.store.listAssignments();
    if (!all.some((a) => a.id === ctx.params.id)) {
      throw new ForbiddenError();
    }
    await ac.store.deleteAssignment(ctx.params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toError(e);
  }
}
