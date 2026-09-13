import { Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { shopPageContext } from "../../../../lib/server/shop-pages";
import { InventoryActions } from "../../../../components/inventory-actions";
import { previewUrl } from "../../../../components/shop-card";

/** Personal inventory: owned, equipped, consumables, expired. */
export default async function InventoryPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "shop");
  const { store } = await shopPageContext(locale);
  const items = await store.getInventory();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("inventoryTitle")}
        description={t("inventorySubtitle")}
      />
      {items.length === 0 ? (
        <EmptyState
          title={t("inventoryTitle")}
          description={t("emptyInventory")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((i) => {
            const preview = previewUrl(i.previewKey);
            return (
              <Card key={i.itemId}>
                <CardContent>
                  <div className="flex items-center gap-3">
                    {preview ? (
                      <img
                        src={preview}
                        alt={i.name}
                        className="h-10 w-10 rounded"
                      />
                    ) : null}
                    <div className="flex-1">
                      <p className="text-base font-bold">{i.name}</p>
                      <p className="text-sm text-ink-muted">
                        ×{i.quantity}
                        {i.equipped ? ` · ${t("equipped")}` : ""}
                        {i.expiresAt ? ` · ${t("expired")}: ${i.expiresAt}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <InventoryActions
                      locale={locale}
                      itemId={i.itemId}
                      equipped={i.equipped}
                      equippable={i.equippable}
                      consumable={i.consumable}
                      quantity={i.quantity}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
