import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clanContext,
  handleCreateHelp,
  handleGetHelp,
  readJson,
} from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await clanContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetHelp(ctx);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await clanContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleCreateHelp(await readJson(req), ctx);
}
