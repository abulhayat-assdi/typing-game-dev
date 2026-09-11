"use client";

import { ErrorState } from "@tap/ui";
import { getTranslator } from "../../lib/i18n";

/**
 * Locale error boundary (default-locale strings: boundaries receive no
 * params, so per-locale copy is unavailable by design — documented).
 */
export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getTranslator("en", "errors");
  return (
    <div className="mx-auto w-full max-w-xl p-8">
      <ErrorState
        title={t("genericTitle")}
        description={t("genericDescription")}
        retryLabel={t("genericRetry")}
        onRetry={reset}
      />
    </div>
  );
}
