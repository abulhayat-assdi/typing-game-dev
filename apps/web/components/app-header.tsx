import Link from "next/link";
import { getTranslator, type Locale } from "../lib/i18n";
import { LocaleSwitcher } from "./locale-switcher";
import { LogoutButton } from "./logout-button";

/** Shell header: brand, language, and session-aware auth actions. */
export function AppHeader({ locale, authed }: { locale: Locale; authed: boolean }) {
  const t = getTranslator(locale, "common");
  const nav = getTranslator(locale, "nav");
  const a11y = getTranslator(locale, "a11y");
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href={`/${locale}`}
          className="font-display text-lg font-bold text-ink"
          aria-label={t("appName")}
        >
          {t("appName")}
        </Link>
        <nav aria-label={a11y("mainNavigation")} className="flex flex-wrap items-center gap-3">
          <LocaleSwitcher current={locale} />
          {authed ? (
            <>
              <Link
                href={`/${locale}/dashboard`}
                className="tap-btn tap-btn-secondary tap-btn-sm"
              >
                {nav("dashboard")}
              </Link>
              <LogoutButton locale={locale} />
            </>
          ) : (
            <>
              <Link href={`/${locale}/login`} className="tap-btn tap-btn-secondary tap-btn-sm">
                {nav("login")}
              </Link>
              <Link href={`/${locale}/register`} className="tap-btn tap-btn-primary tap-btn-sm">
                {nav("register")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
