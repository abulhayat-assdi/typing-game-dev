/**
 * GET /api/inventory — my items.
 */
import { NextResponse } from "next/server";
import { handleGetInventory, shopContext } from "../shop/_helper";

export async function GET(): Promise<Response> {
  const ctx = await shopContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleGetInventory(ctx);
}
