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

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const org = req.nextUrl.searchParams.get("org") ?? undefined;
  try {
    const courses = await ctx.store.listCourses(ctx.orgIds);
    return NextResponse.json({
      courses: org ? courses.filter((c) => c.organizationId === org) : courses,
    });
  } catch (e) {
    return toError(e);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson(req);
  const organizationId = strField(body, "organizationId");
  const title = strField(body, "title");
  const slug = strField(body, "slug");
  if (!organizationId || !title || !slug) {
    return toError(new Error("MALFORMED"));
  }
  try {
    if (!inScope(ctx.orgIds, organizationId)) throw new ForbiddenError();
    const created = await ctx.store.createCourse({ organizationId, title, slug });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return toError(e);
  }
}
