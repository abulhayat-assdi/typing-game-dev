/**
 * POST /api/inventory/use — consume one charge of an owned consumable.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleUse, readJson, shopContext } from "../../shop/_helper";

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await shopContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleUse(await readJson(req), ctx);
}
