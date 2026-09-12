import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import {
  createSupabaseWarStore,
  type WarStore,
} from "../../../../lib/server/war-store";
import { clanAdminContext } from "../clans/_helper";
import enErrors from "../../../../messages/en/errors.json";

export function validWarId(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

export function unknownWar(): NextResponse {
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function warAdminStore(): Promise<WarStore | NextResponse> {
  const ctx = await clanAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return createSupabaseWarStore(client);
}
