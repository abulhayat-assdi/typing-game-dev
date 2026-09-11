/**
 * Route architecture (M3). Edge-safe: pure string logic, zero imports beyond
 * i18n (which is static JSON). Imported by middleware AND tests.
 *
 * Conventions:
 * - Every UI page lives under `/{locale}/...`. API routes are locale-free.
 * - Public locale paths: landing, auth, legal/info. Everything else is
 *   protected by default (default-deny; handlers/layouts enforce via
 *   requireSession — middleware redirect is UX only, never the enforcement).
 * - FUTURE_PATHS reserves student/staff module paths so later milestones add
 *   pages without reworking the boundary.
 */
import {
  DEFAULT_LOCALE,
  isLocale,
  splitLocalePrefix,
  type Locale,
} from "./i18n";

/** Locale-prefixed paths anyone (logged out included) may open. */
const PUBLIC_LOCALE_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/login",
  "/register",
  "/about",
  "/how-it-works",
  "/world-preview",
  "/terms",
  "/privacy",
  "/ad-rewards",
  "/accessibility",
]);

const AUTH_PATHS: ReadonlySet<string> = new Set(["/login", "/register"]);

/** Student + staff module roots (placeholders until their milestones). */
export const FUTURE_PATHS = {
  student: [
    "/home",
    "/map",
    "/library",
    "/missions",
    "/streak",
    "/xp",
    "/badges",
    "/profile",
    "/leaderboard",
    "/competitions",
    "/clan",
    "/settings",
    "/help",
  ],
  staff: ["/staff", "/staff/courses", "/staff/analytics", "/staff/audit"],
} as const;

export type Access = "public" | "protected";

export interface RouteInfo {
  access: Access;
  /** Locale from the URL prefix, or null for locale-free/API paths. */
  locale: Locale | null;
  /** Path with the locale prefix stripped (API paths unchanged). */
  path: string;
  /** True when the URL lacks a required locale prefix (non-API). */
  needsLocaleRedirect: boolean;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function classifyRoute(pathname: string): RouteInfo {
  if (isApiPath(pathname)) {
    return { access: "protected", locale: null, path: pathname, needsLocaleRedirect: false };
  }
  const { locale, path } = splitLocalePrefix(pathname);
  if (locale === null) {
    return {
      access: "protected",
      locale: null,
      path: pathname,
      needsLocaleRedirect: true,
    };
  }
  const access: Access = PUBLIC_LOCALE_PATHS.has(path) ? "public" : "protected";
  return { access, locale, path, needsLocaleRedirect: false };
}

/** Locale-aware login URL, preserving the intended destination. */
export function loginUrl(locale: Locale, next?: string): string {
  const base = `/${locale}/login`;
  if (!next || next === "/" || next === base) return base;
  return `${base}?next=${encodeURIComponent(next)}`;
}

/** Home URL for a locale (post-login landing until dashboards exist). */
export function homeUrl(locale: Locale): string {
  return `/${locale}`;
}

export function isAuthPath(path: string): boolean {
  return AUTH_PATHS.has(path);
}

export function isValidLocalePrefix(pathname: string): boolean {
  const seg = pathname.split("/")[1] ?? "";
  return seg === "" || isLocale(seg);
}

export { DEFAULT_LOCALE };
