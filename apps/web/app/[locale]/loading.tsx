import { getTranslator } from "../../lib/i18n";

/** Locale loading state (announced, motion-safe). */
export default function Loading() {
  const t = getTranslator("en", "a11y");
  return (
    <div className="mx-auto w-full max-w-2xl p-8" aria-busy="true">
      <p role="status" className="tap-sr-only">
        {t("loadingContent")}
      </p>
      <div className="tap-skeleton-stack" aria-hidden="true">
        <div className="tap-skeleton" />
        <div className="tap-skeleton" />
        <div className="tap-skeleton" />
      </div>
    </div>
  );
}
