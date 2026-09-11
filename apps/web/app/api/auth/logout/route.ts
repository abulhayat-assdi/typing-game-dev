/**
 * POST /api/auth/logout — server-side sign-out (clears httpOnly cookies).
 * Always 200: logout is idempotent and must never strand the UI.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";

export async function POST(_req: NextRequest): Promise<Response> {
  try {
    const client = await userDbClient();
    await client?.auth.signOut();
  } catch {
    /* logout never fails loudly */
  }
  return NextResponse.json({ ok: true });
}
