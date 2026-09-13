/**
 * /api/admin/rewards/ads/[action] — policy|definition|flag (POST),
 * funnel (GET). Teachers have no path here.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleFunnel,
  handleSetDefinition,
  handleSetFlag,
  handleSetPolicy,
  readJson,
  rewardedAdminContext,
} from "../_helper";

const POST_ACTIONS = new Set(["policy", "definition", "flag"]);

export async function GET(
  _req: NextRequest,
  ctx: { params: { action: string } },
): Promise<Response> {
  const c = await rewardedAdminContext();
  if (c instanceof NextResponse) return c;
  if (ctx.params.action !== "funnel") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return handleFunnel(c);
}

export async function POST(
  req: NextRequest,
  ctx: { params: { action: string } },
): Promise<Response> {
  const c = await rewardedAdminContext();
  if (c instanceof NextResponse) return c;
  if (!POST_ACTIONS.has(ctx.params.action)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const body = await readJson(req);
  if (ctx.params.action === "definition") return handleSetDefinition(body, c);
  if (ctx.params.action === "flag") return handleSetFlag(body, c);
  return handleSetPolicy(body, c);
}
