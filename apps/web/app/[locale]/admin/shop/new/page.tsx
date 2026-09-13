import { PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { ShopForm } from "../../../../../components/shop-form";

/** Admin shop item creation (configuration form). */
export default function AdminShopNewPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "shop");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} />
      <ShopForm locale={locale} />
    </div>
  );
}
