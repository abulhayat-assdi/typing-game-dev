import { Alert } from "@tap/ui";
import { isLocale, getTranslator } from "../../../lib/i18n";
import { LogoutButton } from "../../../components/logout-button";

/** Public landing for non-active accounts (message only, no data). */
export default function SuspendedPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "auth");
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center gap-4 p-6">
      <Alert tone="warning" title={t("accountSuspended")}>
        {t("accountInactive")}
      </Alert>
      <LogoutButton locale={locale} />
    </main>
  );
}
