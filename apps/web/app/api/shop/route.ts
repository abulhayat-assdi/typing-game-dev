/**
 * GET /api/shop — active catalog (Guild Market).
 */
import { NextResponse } from "next/server";
import { handleListItems, shopContext } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await shopContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListItems(ctx);
}
