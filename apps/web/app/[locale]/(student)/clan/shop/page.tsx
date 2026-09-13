import { Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { clanPageContext } from "../../../../../lib/server/clan-pages";
import { shopPageContext } from "../../../../../lib/server/shop-pages";
import { ShopCard } from "../../../../../components/shop-card";
import { PurchaseButton } from "../../../../../components/purchase-button";
import { InventoryActions } from "../../../../../components/inventory-actions";

/** Clan Market: clan cosmetics for leaders, plus the clan vault. */
export default async function ClanShopPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "shop");
  const { session, store: clanStore } = await clanPageContext(locale);
  const clan = await clanStore.getMyClan(session.userId);
  if (!clan) {
    return (
      <EmptyState title={t("clanShopTitle")} description={t("noItems")} />
    );
  }
  const { store } = await shopPageContext(locale);
  const [items, vault] = await Promise.all([
    store.listItems(),
    store.getClanInventory(clan.id),
  ]);
  const clanItems = items.filter((i) => i.itemType === "clan_cosmetic");
  const vaultIds = new Set(vault.map((v) => v.itemId));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("clanShopTitle")}
        description={t("clanShopSubtitle")}
      />
      {clanItems.length === 0 ? (
        <EmptyState title={t("clanShopTitle")} description={t("noItems")} />
      ) : (
        <div className="flex flex-col gap-3">
          {clanItems.map((i) => (
            <div key={i.id} className="flex flex-col gap-2">
              <ShopCard
                locale={locale}
                item={i}
                owned={vaultIds.has(i.id)}
                href={`/${locale}/shop/${i.id}`}
              />
              {!vaultIds.has(i.id) ? (
                <PurchaseButton
                  locale={locale}
                  itemId={i.id}
                  priceCoins={i.priceCoins}
                  clanId={clan.id}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("clanInventoryTitle")}</h2>
          {vault.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("emptyInventory")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {vault.map((v) => (
                <div key={v.itemId} className="flex flex-col gap-1">
                  <p className="text-sm font-bold">
                    {v.name}
                    {v.equipped ? ` · ${t("equipped")}` : ""}
                  </p>
                  <InventoryActions
                    locale={locale}
                    itemId={v.itemId}
                    equipped={v.equipped}
                    equippable={v.equippable}
                    consumable={false}
                    quantity={v.quantity}
                    clanId={clan.id}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
