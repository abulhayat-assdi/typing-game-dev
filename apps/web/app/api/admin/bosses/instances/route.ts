import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  bossAdminContext,
  handleCreateInstance,
  readJson,
} from "../_helper";

export async function POST(req: NextRequest): Promise<Response> {
  const c = await bossAdminContext();
  if (c instanceof NextResponse) return c;
  return handleCreateInstance(await readJson(req), c);
}
