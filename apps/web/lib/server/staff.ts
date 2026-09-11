/**
 * Actor + authorization boundary (M7). Centralizes every role/scope/status
 * check so UI components and routes never scatter authorization logic.
 * Enforcement order: database/RLS first, these server guards second, route
 * layouts third. Frontend hiding is never security.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus, AppRole } from "../../lib/auth-flow";

export interface Actor {
  userId: string;
  email: string | null;
  roles: AppRole[];
  /** Admin org ids; empty for non-admins. Super admin is global (no list). */
  adminOrgIds: string[];
  status: AccountStatus;
}

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const ROLES: ReadonlySet<string> = new Set([
  "student",
  "teacher",
  "admin",
  "super_admin",
]);

const STATUSES: ReadonlySet<string> = new Set([
  "active",
  "inactive",
  "suspended",
]);

/** Assemble the actor from RLS-filtered reads (own rows only). */
export async function getCurrentActor(
  client: SupabaseClient,
): Promise<Actor | null> {
  const session = (await client.auth.getUser()) as {
    data: { user: { id: string; email?: string | null } | null };
    error: { message: string } | null;
  };
  if (session.error || !session.data.user) return null;
  const userId = session.data.user.id;
  const email = session.data.user.email ?? null;

  const rolesRes = await client
    .from("user_roles")
    .select("role, organization_id")
    .eq("user_id", userId);
  const profRes = await client
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  const roles: AppRole[] = [];
  const adminOrgIds: string[] = [];
  if (!rolesRes.error && Array.isArray(rolesRes.data)) {
    for (const row of rolesRes.data.filter(isRecord)) {
      if (typeof row.role === "string" && ROLES.has(row.role)) {
        roles.push(row.role as AppRole);
      }
      if (
        row.role === "admin" &&
        typeof row.organization_id === "string"
      ) {
        adminOrgIds.push(row.organization_id);
      }
    }
  }
  const rawStatus: unknown =
    !profRes.error && isRecord(profRes.data)
      ? profRes.data.account_status
      : "active";
  const status: AccountStatus =
    typeof rawStatus === "string" && STATUSES.has(rawStatus)
      ? (rawStatus as AccountStatus)
      : "active";

  return {
    userId,
    email,
    roles,
    adminOrgIds,
    status,
  };
}

/** Any authenticated, active account. */
export async function requireActor(client: SupabaseClient): Promise<Actor> {
  const actor = await getCurrentActor(client);
  if (!actor) throw new AuthApiError(401, "UNAUTHENTICATED");
  if (actor.status !== "active") {
    throw new AuthApiError(403, actor.status === "suspended" ? "SUSPENDED" : "INACTIVE");
  }
  return actor;
}

/** One of the given roles (super_admin passes everything) + active. */
export async function requireRoles(
  client: SupabaseClient,
  roles: AppRole[],
): Promise<Actor> {
  const actor = await requireActor(client);
  const ok =
    actor.roles.includes("super_admin") ||
    roles.some((r) => actor.roles.includes(r));
  if (!ok) throw new AuthApiError(403, "FORBIDDEN");
  return actor;
}

/** Teacher console: assigned teachers (super_admin always allowed). */
export async function requireTeacher(client: SupabaseClient): Promise<Actor> {
  return requireRoles(client, ["teacher"]);
}

/**
 * Admin console: org admins (scope = their orgs) or global super_admin.
 * Returns null orgIds for global (super_admin), else the scoped list.
 */
export async function requireAdmin(
  client: SupabaseClient,
): Promise<{ actor: Actor; orgIds: string[] | null }> {
  const actor = await requireActor(client);
  if (actor.roles.includes("super_admin")) return { actor, orgIds: null };
  if (!actor.roles.includes("admin") || actor.adminOrgIds.length === 0) {
    throw new AuthApiError(403, "FORBIDDEN");
  }
  return { actor, orgIds: actor.adminOrgIds };
}

export async function requireSuperAdmin(
  client: SupabaseClient,
): Promise<Actor> {
  return requireRoles(client, ["super_admin"]);
}
