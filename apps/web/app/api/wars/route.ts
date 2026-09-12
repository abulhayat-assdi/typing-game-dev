/**
 * GET /api/wars — my wars. POST /api/wars — challenge (clan leadership).
 * GET /api/wars/challengeable — opponent picker (leaders only).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleChallenge,
  handleListWars,
  readJson,
  warContext,
} from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await warContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListWars(ctx);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await warContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleChallenge(await readJson(req), ctx);
}
