import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "../../../../../lib/server/auth";
import { userDbClient } from "../../../../../lib/server/auth";
import { requireSuperAdmin } from "../../../../../lib/server/staff";
import { createSupabaseStaffStore } from "../../../../../lib/server/staff-store";
import { readJson, toError } from "../../_helper";
import { AuthApiError } from "../../../../../lib/server/staff";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { slug: string } },
): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
  try {
    await requireSuperAdmin(client);
  } catch (e) {
    return toError(e instanceof AuthApiError ? e : new AuthApiError(403, "FORBIDDEN"));
  }
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.isActive !== "boolean") {
    return toError(new Error("MALFORMED"));
  }
  try {
    await createSupabaseStaffStore(client).setGameActive(
      ctx.params.slug,
      body.isActive,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toError(e);
  }
}
