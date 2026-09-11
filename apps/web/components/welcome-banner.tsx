import Link from "next/link";
import { Alert } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";

/** First-session guide: three steps into the recommended game. */
export function WelcomeBanner({
  locale,
  gameHref,
}: {
  locale: Locale;
  gameHref: string;
}) {
  const t = getTranslator(locale, "onboarding");
  return (
    <Alert tone="info" title={t("welcome")}>
      <p className="mb-2">{t("intro")}</p>
      <ol className="mb-3 list-decimal pl-5">
        <li>{t("stepPlay")}</li>
        <li>{t("stepResult")}</li>
        <li>{t("stepUnlock")}</li>
      </ol>
      <Link href={gameHref} className="tap-btn tap-btn-primary tap-btn-md">
        {t("startNow")}
      </Link>
    </Alert>
  );
}
