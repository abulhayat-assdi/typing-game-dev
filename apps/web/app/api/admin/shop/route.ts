/**
 * /api/admin/shop — GET catalog, POST create (admins only).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  handleCreateItem,
  handleListCatalog,
  readJson,
  shopAdminContext,
} from "./_helper";

export async function GET(): Promise<Response> {
  const c = await shopAdminContext();
  if (c instanceof NextResponse) return c;
  return handleListCatalog(c);
}

export async function POST(req: NextRequest): Promise<Response> {
  const c = await shopAdminContext();
  if (c instanceof NextResponse) return c;
  return handleCreateItem(await readJson(req), c);
}
