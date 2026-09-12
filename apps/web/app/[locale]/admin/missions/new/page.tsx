import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { MissionForm } from "../../../../../components/mission-form";

/** Admin mission creation (configuration form, not a visual editor). */
export default function AdminMissionNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "missions");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <MissionForm locale={locale} />
    </div>
  );
}
