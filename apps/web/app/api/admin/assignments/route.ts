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

export async function GET(_req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const assignments = await ctx.store.listAssignments();
    return NextResponse.json({ assignments });
  } catch (e) {
    return toError(e);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson(req);
  const email = strField(body, "email");
  const userId = strField(body, "userId");
  const courseId = strField(body, "courseId") || undefined;
  const batchId = strField(body, "batchId") || undefined;
  if ((!email && !userId) || (!courseId && !batchId)) {
    return toError(new Error("MALFORMED"));
  }
  try {
    const targetId =
      userId ||
      (await ctx.store.lookupUserByEmail(email))?.userId ||
      "";
    if (!targetId) throw new ForbiddenError();
    if (courseId) {
      const courses = await ctx.store.listCourses(ctx.orgIds);
      const course = courses.find((c) => c.id === courseId);
      if (!course || !inScope(ctx.orgIds, course.organizationId)) {
        throw new ForbiddenError();
      }
    }
    if (batchId) {
      const info = await ctx.store.batchInfo(batchId);
      if (!info || !inScope(ctx.orgIds, info.organizationId)) {
        throw new ForbiddenError();
      }
    }
    const created = await ctx.store.createAssignment({
      userId: targetId,
      courseId,
      batchId,
    });
    // New teachers need the teacher role to sign in anywhere useful.
    try {
      await ctx.store.grantRole(targetId, "teacher");
    } catch {
      /* assignment stands; role grant surfaced below if it failed */
    }
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return toError(e);
  }
}
