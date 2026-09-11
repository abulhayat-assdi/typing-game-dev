import Link from "next/link";
import { getTranslator, type Locale } from "../lib/i18n";
import { LocaleSwitcher } from "./locale-switcher";

/** Minimal shell header: brand + language. Module nav arrives with M6. */
export function AppHeader({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "common");
  const a11y = getTranslator(locale, "a11y");
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href={`/${locale}`}
          className="font-display text-lg font-bold text-ink"
          aria-label={t("appName")}
        >
          {t("appName")}
        </Link>
        <nav aria-label={a11y("mainNavigation")} className="flex items-center gap-4">
          <LocaleSwitcher current={locale} />
        </nav>
      </div>
    </header>
  );
}
