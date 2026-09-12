/**
 * /api/admin/tournaments — GET list, POST create (admins only).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleCreateTournament,
  handleListTournaments,
  readJson,
  tournamentAdminContext,
} from "./_helper";

export async function GET(): Promise<Response> {
  const c = await tournamentAdminContext();
  if (c instanceof NextResponse) return c;
  return handleListTournaments(c);
}

export async function POST(req: NextRequest): Promise<Response> {
  const c = await tournamentAdminContext();
  if (c instanceof NextResponse) return c;
  return handleCreateTournament(await readJson(req), c);
}
