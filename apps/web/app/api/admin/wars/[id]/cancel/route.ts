import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { toWarError } from "../../../../wars/_helper";
import { unknownWar, validWarId, warAdminStore } from "../../_helper";

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } },
): Promise<Response> {
  if (!validWarId(ctx.params.id)) return unknownWar();
  const store = await warAdminStore();
  if (store instanceof NextResponse) return store;
  try {
    await store.cancel(ctx.params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toWarError(e);
  }
}
