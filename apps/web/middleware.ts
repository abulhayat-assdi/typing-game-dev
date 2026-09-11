/**
 * Edge middleware (M3). Two cheap, network-free jobs:
 *  1. Enforce the `/{locale}/...` prefix (default `en`; unknown prefixes fold
 *     to the default rather than 404ing the adventure).
 *  2. UX-level auth redirects based on Supabase cookie PRESENCE.
 *
 * This middleware never grants access: every protected layout/route rechecks
 * via requireSession (lib/server/auth.ts). Cookie presence only avoids a
 * wasted render round-trip.
 *
 * Edge-safe by construction: imports lib/routes + lib/i18n only (static
 * strings/JSON — no Node APIs, no Supabase client). Covered indirectly by
 * lib/routes.test.ts; the workers-compat test asserts the import surface.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./lib/i18n";
import {
  classifyRoute,
  homeUrl,
  isAuthPath,
  loginUrl,
} from "./lib/routes";

function hasSessionCookie(req: NextRequest): boolean {
  // Supabase SSR names session cookies `sb-<project-ref>-auth-token`.
  // The ref is deployment config, so match the shape instead of the name.
  return req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  // API routes: handlers enforce auth themselves (default-deny inside).
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const info = classifyRoute(pathname);

  if (info.needsLocaleRedirect) {
    const seg = pathname.split("/")[1] ?? "";
    // `/fr/map` (invalid locale attempt) folds to `/en/map`;
    // `/dashboard` (missing prefix) becomes `/en/dashboard`.
    if (/^[A-Za-z]{2}(-[A-Za-z]{2,4})?$/.test(seg) && !isLocale(seg)) {
      const rest = `/${pathname.split("/").slice(2).join("/")}` || "/";
      return NextResponse.redirect(
        new URL(`/${DEFAULT_LOCALE}${rest}${search}`, req.url),
      );
    }
    return NextResponse.redirect(
      new URL(`/${DEFAULT_LOCALE}${pathname}${search}`, req.url),
    );
  }

  const locale = (info.locale ?? DEFAULT_LOCALE) as Locale;

  if (info.access === "protected" && !hasSessionCookie(req)) {
    return NextResponse.redirect(
      new URL(loginUrl(locale, `/${locale}${info.path}`), req.url),
    );
  }

  if (isAuthPath(info.path) && hasSessionCookie(req)) {
    return NextResponse.redirect(new URL(homeUrl(locale), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
