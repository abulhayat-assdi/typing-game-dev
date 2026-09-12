import { NextResponse } from "next/server";
import { handleChallengeable, warContext } from "../_helper";

export async function GET(): Promise<Response> {
  const ctx = await warContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleChallengeable(ctx);
}
