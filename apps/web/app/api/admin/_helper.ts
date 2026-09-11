/**
 * Shared admin-route gate (M7). Every /api/admin handler resolves the actor,
 * enforces org scope, and maps errors to safe codes. RLS remains the final
 * enforcer underneath; these checks produce clean 403s instead of silent
 * no-ops (PostgREST denials return empty data, not errors).
 */
import { NextResponse } from "next/server";
import { getSession } from "../../../lib/server/auth";
import { userDbClient } from "../../../lib/server/auth";
import {
  AuthApiError,
  requireAdmin,
  type Actor,
} from "../../../lib/server/staff";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseStaffStore,
  type StaffStore,
} from "../../../lib/server/staff-store";
import enErrors from "../../../messages/en/errors.json";

export interface AdminContext {
  actor: Actor;
  /** Null = global (super_admin), else scoped org ids. */
  orgIds: string[] | null;
  store: StaffStore;
}

export function inScope(orgIds: string[] | null, orgId: string): boolean {
  return orgIds === null || orgIds.includes(orgId);
}

export function toError(e: unknown): NextResponse {
  if (e instanceof AuthApiError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (e instanceof ConflictError) {
    return NextResponse.json(
      { error: e.message, message: enErrors.valuesMismatch },
      { status: 409 },
    );
  }
  if (e instanceof NotFoundError) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { error: "FAILED", message: enErrors.genericDescription },
    { status: 500 },
  );
}

export async function adminContext(): Promise<AdminContext | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
      { status: 401 },
    );
  }
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  try {
    const { actor, orgIds } = await requireAdmin(client);
    return { actor, orgIds, store: createSupabaseStaffStore(client) };
  } catch (e) {
    return toError(e);
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function strField(body: unknown, key: string): string {
  if (!isRecord(body)) return "";
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}
