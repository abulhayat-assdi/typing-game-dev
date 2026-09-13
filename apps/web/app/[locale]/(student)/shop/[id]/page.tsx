import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { shopPageContext } from "../../../../../lib/server/shop-pages";
import { PurchaseButton } from "../../../../../components/purchase-button";
import { previewUrl } from "../../../../../components/shop-card";

/** Item detail: preview, price, ownership, purchase. */
export default async function ShopItemPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "shop");
  const { store } = await shopPageContext(locale);
  const item = await store.getItem(params.id);
  if (!item) notFound();
  const preview = previewUrl(item.previewKey ?? item.assetKey);
  const owned = item.ownedQuantity > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.name} description={item.description} />
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
            <p className="text-sm">
              {t("price")}: {item.priceCoins} {t("coins")}
            </p>
            {owned ? (
              <p className="text-sm">
                {t("owned")}
                {item.equipped ? ` · ${t("equipped")}` : ""}
              </p>
            ) : (
              <PurchaseButton
                locale={locale}
                itemId={item.id}
                priceCoins={item.priceCoins}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
