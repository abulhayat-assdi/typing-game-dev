import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { TournamentForm } from "../../../../../components/tournament-form";

/** Admin tournament creation (configuration form, not a visual editor). */
export default function AdminTournamentNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "tournaments");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <TournamentForm locale={locale} />
    </div>
  );
}
