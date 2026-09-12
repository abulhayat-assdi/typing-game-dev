import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type {
  AdaptiveTrend,
  AdaptiveWeakness,
} from "../lib/server/adaptive-store";

/** Skill snapshot: accuracy/speed, trends, keys to practice. */
export function SkillOverview({
  locale,
  accuracy,
  wpm,
  trends,
  weaknesses,
}: {
  locale: Locale;
  accuracy: number | null;
  wpm: number | null;
  trends: AdaptiveTrend[];
  weaknesses: AdaptiveWeakness[];
}) {
  const t = getTranslator(locale, "adaptive");
  const trendText = (trend: string): string => {
    if (trend === "improving") return t("trendImproving");
    if (trend === "stable") return t("trendStable");
    if (trend === "declining") return t("trendDeclining");
    return t("trendInsufficient");
  };
  const weakKeys = weaknesses
    .filter((w) => w.type === "key")
    .slice(0, 6);
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent>
          <div className="flex gap-6 text-sm">
            <span>
              {t("accuracyLabel")}:{" "}
              {accuracy === null
                ? "—"
                : `${String(Math.round(accuracy * 10) / 10)}%`}
            </span>
            <span>
              {t("wpmLabel")}:{" "}
              {wpm === null ? "—" : String(Math.round(wpm * 10) / 10)}
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {trends.map((tr) => (
              <li key={tr.metric}>
                {tr.metric}: {trendText(tr.trend)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {weakKeys.length > 0 ? (
        <Card>
          <CardContent>
            <h3 className="mb-1 text-sm font-bold">{t("weakKeysTitle")}</h3>
            <p className="text-sm">{weakKeys.map((w) => w.target).join(" · ")}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
