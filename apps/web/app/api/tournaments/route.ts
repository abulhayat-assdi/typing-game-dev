/**
 * GET /api/tournaments — visible tournaments.
 */
import { NextResponse } from "next/server";
import { handleListTournaments, tournamentContext } from "./_helper";

export async function GET(): Promise<Response> {
  const ctx = await tournamentContext();
  if (ctx instanceof NextResponse) return ctx;
  return handleListTournaments(ctx);
}
