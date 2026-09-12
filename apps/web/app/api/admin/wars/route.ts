import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import { createSupabaseWarStore } from "../../../../lib/server/war-store";
import { clanAdminContext } from "../clans/_helper";
import enErrors from "../../../../messages/en/errors.json";

/** GET /api/admin/wars — every visible war (RLS-scoped). */
export async function GET(): Promise<Response> {
  const ctx = await clanAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return NextResponse.json({
    wars: await createSupabaseWarStore(client).listWars(),
  });
}
