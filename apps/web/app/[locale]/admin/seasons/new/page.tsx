import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { SeasonForm } from "../../../../../components/season-form";

/** Admin season creation (configuration form, not a visual editor). */
export default function AdminSeasonNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <SeasonForm locale={locale} />
    </div>
  );
}
