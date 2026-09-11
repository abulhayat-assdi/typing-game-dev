"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";
import { LogoutButton } from "./logout-button";

export interface StaffNavItem {
  href: string;
  label: string;
}

/** Shared staff shell nav: section links + account menu (logout). */
export function StaffNav({
  locale,
  items,
  homeHref,
}: {
  locale: Locale;
  items: StaffNavItem[];
  homeHref: string;
}) {
  const pathname = usePathname();
  const t = getTranslator(locale, "staff");
  const brand = getTranslator(locale, "common")("appName");
  return (
    <nav aria-label={t("competitions")} className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-4">
        <Link
          href={homeHref}
          aria-label={brand}
          className="whitespace-nowrap px-3 py-2.5 font-display text-lg font-bold"
        >
          TAP
        </Link>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold " +
                (active
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-ink-muted")
              }
            >
              {item.label}
            </Link>
          );
        })}
        <span className="ml-auto py-1.5">
          <LogoutButton locale={locale} />
        </span>
      </div>
    </nav>
  );
}
