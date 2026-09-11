/**
 * Browser Supabase client (M7). Carries ONLY the public anon key — safe for
 * client components (service-role access lives exclusively in lib/server/*).
 * Cookie methods are explicit (getAll/setAll) so this survives the next
 * @supabase/ssr major, which drops get/set/remove support.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { CookieMethodsBrowser } from "@supabase/ssr";
import { publicEnv } from "./env-public";

export interface BrowserAuth {
  signInWithPassword(creds: {
    email: string;
    password: string;
  }): Promise<{ error: { message: string } | null }>;
  signUp(creds: {
    email: string;
    password: string;
  }): Promise<{
    data: { session: unknown };
    error: { message: string } | null;
  }>;
  signOut(): Promise<{ error: unknown }>;
  resetPasswordForEmail(
    email: string,
    opts?: { redirectTo?: string },
  ): Promise<{ error: unknown }>;
  updateUser(attrs: { password: string }): Promise<{
    error: { message: string } | null;
  }>;
}

export interface BrowserClient {
  auth: BrowserAuth;
}

const cookieMethods: CookieMethodsBrowser = {
  getAll: () =>
    document.cookie.split(";").flatMap((part) => {
      const i = part.indexOf("=");
      if (i < 0) return [];
      const name = part.slice(0, i).trim();
      if (!name) return [];
      return [{ name, value: decodeURIComponent(part.slice(i + 1).trim()) }];
    }),
  setAll: (cookiesToSet) => {
    for (const c of cookiesToSet) {
      let str = `${c.name}=${encodeURIComponent(c.value)}; path=${c.options.path ?? "/"}`;
      if (c.options.maxAge !== undefined) {
        str += `; max-age=${String(c.options.maxAge)}`;
      }
      if (c.options.domain) str += `; domain=${c.options.domain}`;
      if (c.options.sameSite) str += `; samesite=${String(c.options.sameSite)}`;
      if (c.options.secure) str += "; secure";
      document.cookie = str;
    }
  },
};

let cached: BrowserClient | null = null;

export function browserClient(): BrowserClient | null {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  if (!cached) {
    cached = createBrowserClient(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
      { cookies: cookieMethods },
    );
  }
  return cached;
}
