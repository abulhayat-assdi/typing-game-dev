import Link from "next/link";
import { ErrorState } from "@tap/ui";
import { DEFAULT_LOCALE, getTranslator } from "../lib/i18n";

/**
 * Root 404. Renders inside [locale]/layout (which always supplies <html> —
 * middleware folds every UI path into a valid locale), so no <html> here.
 * Default-locale copy: 404 boundaries receive no params by design.
 */
export default function NotFound() {
  const t = getTranslator(DEFAULT_LOCALE, "errors");
  const common = getTranslator(DEFAULT_LOCALE, "common");
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center p-8">
      <ErrorState
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
      />
      <Link
        href={`/${DEFAULT_LOCALE}`}
        className="tap-btn tap-btn-primary tap-btn-md mt-4"
      >
        {common("actionBackHome")}
      </Link>
    </main>
  );
}
