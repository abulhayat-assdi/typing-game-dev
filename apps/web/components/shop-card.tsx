import Link from "next/link";
import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import { publicEnv } from "../lib/env-public";
import type { ShopItemSummary } from "../lib/server/shop-store";

export function previewUrl(key: string | null): string | null {
  if (!key) return null;
  const base = publicEnv.r2PublicBaseUrl.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${key}`;
}

/** Guild Market card: preview, name, price, ownership state. */
export function ShopCard({
  locale,
  item,
  owned,
  href,
}: {
  locale: Locale;
  item: ShopItemSummary;
  owned: boolean;
  href: string;
}) {
  const t = getTranslator(locale, "shop");
  const preview = previewUrl(item.previewKey);
  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          {preview ? (
            <img src={preview} alt={item.name} className="h-12 w-12 rounded" />
          ) : (
            <span aria-hidden className="tap-shop-glyph">
              ◆
            </span>
          )}
          <div className="flex-1">
            <Link href={href} className="text-base font-bold hover:underline">
              {item.name}
            </Link>
            <p className="text-sm text-ink-muted">
              {item.priceCoins} {t("coins")}
              {item.isFeatured ? ` · ${t("featured")}` : ""}
            </p>
          </div>
          {owned ? <span className="tap-badge">{t("owned")}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
