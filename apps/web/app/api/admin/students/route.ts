import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminContext, toError } from "../_helper";

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const students = await ctx.store.searchUsers(q, 50);
    return NextResponse.json({ students });
  } catch (e) {
    return toError(e);
  }
}
