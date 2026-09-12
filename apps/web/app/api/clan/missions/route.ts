import { NextResponse } from "next/server";
import { clanContext, handleGetClanMissions } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await clanContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetClanMissions(ctx);
}
