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

function joinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `B-${Array.from(bytes, (b) => (b % 36).toString(36)).join("").toUpperCase()}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const course = req.nextUrl.searchParams.get("course") ?? undefined;
  try {
    const batches = await ctx.store.listBatches(ctx.orgIds, course);
    return NextResponse.json({ batches });
  } catch (e) {
    return toError(e);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson(req);
  const courseId = strField(body, "courseId");
  const name = strField(body, "name");
  const code = strField(body, "joinCode") || joinCode();
  if (!courseId || !name) return toError(new Error("MALFORMED"));
  try {
    const courses = await ctx.store.listCourses(ctx.orgIds);
    const course = courses.find((c) => c.id === courseId);
    if (!course || !inScope(ctx.orgIds, course.organizationId)) {
      throw new ForbiddenError();
    }
    const created = await ctx.store.createBatch({
      courseId,
      name,
      joinCode: code,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return toError(e);
  }
}
