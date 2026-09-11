import Link from "next/link";
import { getTranslator, type Locale } from "../lib/i18n";

/** Forbidden state for role-gated areas (no private data rendered). */
export function ForbiddenBlock({ locale }: { locale: Locale }) {
  const t = getTranslator(locale, "errors");
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">{t("forbiddenTitle")}</h1>
      <p className="text-ink-muted">{t("forbiddenDescription")}</p>
      <Link href={`/${locale}`} className="tap-btn tap-btn-secondary tap-btn-md">
        {t("notFoundBackHome")}
      </Link>
    </main>
  );
}
