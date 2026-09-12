import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { BossForm } from "../../../../../components/boss-form";

/** Admin boss creation (configuration form, not a visual editor). */
export default function AdminBossNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "bosses");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <BossForm locale={locale} />
    </div>
  );
}
