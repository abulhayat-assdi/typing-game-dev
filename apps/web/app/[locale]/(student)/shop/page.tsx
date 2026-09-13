import { EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { shopPageContext } from "../../../../lib/server/shop-pages";
import { ShopCard } from "../../../../components/shop-card";

/** Guild Market: featured, categories, search. */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { category?: string; q?: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "shop");
  const { store } = await shopPageContext(locale);
  const [items, inventory] = await Promise.all([
    store.listItems(),
    store.getInventory(),
  ]);
  const owned = new Set(inventory.map((i) => i.itemId));
  const category = searchParams.category ?? "";
  const q = (searchParams.q ?? "").toLowerCase();
  const categories = [...new Set(items.map((i) => i.category))].sort();
  const shown = items.filter(
    (i) =>
      (category === "" || i.category === category) &&
      (q === "" ||
        i.name.toLowerCase().includes(q) ||
        i.slug.includes(q)),
  );
  const featured = items.filter((i) => i.isFeatured);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("marketTitle")} description={t("marketSubtitle")} />
      <form method="get" className="flex flex-wrap gap-2">
        <select name="category" className="tap-input" defaultValue={category}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          name="q"
          className="tap-input"
          placeholder={t("searchPlaceholder")}
          defaultValue={searchParams.q ?? ""}
        />
        <button type="submit" className="tap-btn tap-btn-secondary tap-btn-sm">
          {t("searchPlaceholder")}
        </button>
      </form>
      {featured.length > 0 && category === "" && q === "" ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{t("featured")}</h2>
          {featured.map((i) => (
            <ShopCard
              key={i.id}
              locale={locale}
              item={i}
              owned={owned.has(i.id)}
              href={`/${locale}/shop/${i.id}`}
            />
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <EmptyState title={t("marketTitle")} description={t("noItems")} />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((i) => (
            <ShopCard
              key={i.id}
              locale={locale}
              item={i}
              owned={owned.has(i.id)}
              href={`/${locale}/shop/${i.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
