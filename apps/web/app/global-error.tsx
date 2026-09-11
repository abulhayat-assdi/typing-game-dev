"use client";

import { getTranslator } from "../lib/i18n";

/** Last-resort boundary: own <html>/<body> as required by Next.js. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getTranslator("en", "errors");
  const common = getTranslator("en", "common");
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-bold">{t("genericTitle")}</h1>
          <p>{t("genericDescription")}</p>
          <button
            type="button"
            className="tap-btn tap-btn-primary tap-btn-md"
            onClick={reset}
          >
            {common("actionRetry")}
          </button>
        </main>
      </body>
    </html>
  );
}
