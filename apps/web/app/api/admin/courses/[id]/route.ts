import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  adminContext,
  inScope,
  readJson,
  toError,
} from "../../_helper";
import { ForbiddenError, NotFoundError } from "../../../../../lib/server/staff-store";

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
    const courses = await ac.store.listCourses(ac.orgIds);
    const course = courses.find((c) => c.id === ctx.params.id);
    if (!course || !inScope(ac.orgIds, course.organizationId)) {
      throw new NotFoundError();
    }
    const patch: { title?: string; isActive?: boolean } = {};
    if (isRecord(body) && typeof body.title === "string" && body.title.trim()) {
      patch.title = body.title.trim();
    }
    if (isRecord(body) && typeof body.isActive === "boolean") {
      patch.isActive = body.isActive;
    }
    await ac.store.updateCourse(ctx.params.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return toError(new ForbiddenError());
    }
    return toError(e);
  }
}
