/**
 * GET /api/auth/actor — resolves the caller's roles, org scopes and account
 * status server-side. The client uses this ONLY to pick a landing page and
 * to gate messages; every protected route re-verifies independently.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import { getCurrentActor } from "../../../../lib/server/staff";
import enErrors from "../../../../messages/en/errors.json";

export function handleGetActor(deps: {
  actor: {
    userId: string;
    email: string | null;
    roles: string[];
    adminOrgIds: string[];
    status: string;
  } | null;
}): Response {
  if (!deps.actor) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
      { status: 401 },
    );
  }
  return NextResponse.json({ actor: deps.actor });
}

export async function GET(_req: NextRequest): Promise<Response> {
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return handleGetActor({ actor: await getCurrentActor(client) });
}
