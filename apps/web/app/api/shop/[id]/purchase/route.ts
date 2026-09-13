/**
 * POST /api/shop/[id]/purchase — atomic idempotent purchase.
 * Body: { requestId, clanId? }. No price field exists by design.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handlePurchase, readJson, shopContext } from "../../_helper";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const c = await shopContext();
  if (c instanceof NextResponse) return c;
  return handlePurchase(ctx.params.id, await readJson(req), c);
}
