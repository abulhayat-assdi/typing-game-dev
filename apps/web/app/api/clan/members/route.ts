import { NextResponse } from "next/server";
import { clanContext, handleGetMembers } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await clanContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetMembers(ctx);
}
