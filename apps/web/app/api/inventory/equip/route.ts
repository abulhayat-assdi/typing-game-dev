/**
 * POST /api/inventory/equip — equip/unequip owned items (personal or
 * clan via clanId; clan path is staff-gated in SQL).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleEquip, readJson, shopContext } from "../../shop/_helper";

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await shopContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleEquip(await readJson(req), ctx);
}
