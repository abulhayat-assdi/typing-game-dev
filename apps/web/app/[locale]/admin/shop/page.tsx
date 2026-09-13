import Link from "next/link";
import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { shopPageContext } from "../../../../lib/server/shop-pages";

/** Admin shop list (drafts included via RLS admin policy). */
export default async function AdminShopPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "shop");
  const { store } = await shopPageContext(locale);
  const items = await store.listItems();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} />
      <div>
        <Link
          className="tap-btn tap-btn-primary"
          href={`/${locale}/admin/shop/new`}
        >
          {t("createTitle")}
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("manageTitle")} description={t("noItems")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link href={`/${locale}/admin/shop/${i.id}`}>
                {i.name} ({i.slug})
              </Link>
              <span className="tap-badge">
                {i.isActive ? "active" : "draft"} · {i.priceCoins}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
