/**
 * Server session boundary (M3). Enforcement point for protected routes and
 * API handlers — middleware redirects are UX only and never trusted here.
 *
 * Returns null (never throws) when: env unconfigured, no session cookie,
 * invalid/expired session, or Auth unreachable. Callers map null → 401 /
 * login redirect. The Supabase client is injectable so unit tests never touch
 * the network or next/headers.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "./env";

export interface Session {
  userId: string;
  email: string | null;
}

interface UserLike {
  id: string;
  email?: string | null;
}

export interface SupabaseClientLike {
  auth: {
    getUser: () => Promise<{
      data: { user: UserLike | null };
      error: unknown;
    }>;
  };
}

/**
 * User-scoped Supabase client (RLS applies; PostgREST sees the user's JWT so
 * auth.uid() works inside SECURITY DEFINER functions). Null when
 * unconfigured — callers fail closed. Service role is NOT used by M4 routes;
 * only future seed/admin tooling holds it.
 */
export async function userDbClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const store = await cookies();
    return createServerClient(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
      {
        cookies: {
          getAll: () => store.getAll(),
          setAll: (pairs) => {
            // Route handlers may persist refreshed tokens; Server Components
            // are read-only — a set() throw there must not break the read.
            try {
              pairs.forEach((p) => store.set(p.name, p.value, p.options));
            } catch {
              /* read-only context: session read still valid */
            }
          },
        },
      },
    );
  } catch {
    return null;
  }
}

async function createAppClient(): Promise<SupabaseClientLike | null> {
  return userDbClient();
}

export async function getSession(deps?: {
  client?: SupabaseClientLike | null;
}): Promise<Session | null> {
  try {
    const client = deps?.client ?? (await createAppClient());
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/** JSON 401 envelope for API routes (pages use login redirects instead). */
export function unauthorized(message = "Unauthorized"): Response {
  return Response.json({ error: "UNAUTHORIZED", message }, { status: 401 });
}

/**
 * Cheap UX-only session presence check (mirrors middleware's cookie-shape
 * match — no network round trip). Never used for enforcement: layouts/routes
 * still call getSession()/requireActor() to verify the cookie is valid.
 */
export async function hasAuthCookie(): Promise<boolean> {
  try {
    const store = await cookies();
    return store
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
  } catch {
    return false;
  }
}
