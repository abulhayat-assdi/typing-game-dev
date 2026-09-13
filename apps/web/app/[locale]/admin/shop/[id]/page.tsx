import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale } from "../../../../../lib/i18n";
import { shopPageContext } from "../../../../../lib/server/shop-pages";
import { ShopAdminActions } from "../../../../../components/shop-admin-actions";
import { previewUrl } from "../../../../../components/shop-card";

/** Admin item management: activate/deactivate, preview, ownership. */
export default async function AdminShopManagePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const { store } = await shopPageContext(locale);
  const item = await store.getItem(params.id);
  if (!item) notFound();
  const preview = previewUrl(item.previewKey ?? item.assetKey);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.name}
        description={`${item.slug} · ${String(item.priceCoins)} coins`}
      />
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            {preview ? (
              <img
                src={preview}
                alt={item.name}
                className="max-h-48 rounded object-contain"
              />
            ) : null}
            <ShopAdminActions
              locale={locale}
              itemId={item.id}
              active={item.isActive}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
