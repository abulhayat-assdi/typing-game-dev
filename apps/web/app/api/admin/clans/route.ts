import { NextResponse } from "next/server";
import { clanAdminContext, handleListClans } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await clanAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListClans(ctx);
}
