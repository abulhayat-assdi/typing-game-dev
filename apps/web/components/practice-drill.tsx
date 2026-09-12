import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { PracticeDrill } from "@tap/adaptive";

/** Drill preview: curated words/sentences containing the weak keys. */
export function PracticeDrillCard({
  locale,
  drill,
}: {
  locale: Locale;
  drill: PracticeDrill;
}) {
  const t = getTranslator(locale, "adaptive");
  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-base font-bold">
          {t("drillTitle")}: {drill.targetKeys.join(" · ")}
        </h2>
        <p className="mb-2 text-sm text-ink-muted">{t("drillHint")}</p>
        <ul className="flex flex-wrap gap-2">
          {drill.items.map((item) => (
            <li key={item} className="tap-badge">
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
