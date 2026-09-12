import Link from "next/link";
import { Card, CardContent } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { AdaptiveRecommendation } from "../lib/server/adaptive-store";

/** One recommendation card: mission-like framing + why + start link. */
export function RecommendationCard({
  locale,
  recommendation,
}: {
  locale: Locale;
  recommendation: AdaptiveRecommendation;
}) {
  const t = getTranslator(locale, "adaptive");
  return (
    <Card>
      <CardContent>
        <p className="text-base font-bold">{recommendation.message}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {t("skillFocus")}:{" "}
          {recommendation.targets.length > 0
            ? recommendation.targets.join(", ")
            : recommendation.reason}
        </p>
        <p className="text-sm text-ink-muted">
          {t("expectedBenefit")}: {recommendation.benefit}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/${locale}/games/${recommendation.gameSlug}`}
            className="tap-btn tap-btn-primary tap-btn-sm"
          >
            {t("startPractice")}
          </Link>
          <span className="tap-badge" title={t("whySeeing")}>
            {recommendation.reason}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard widget: the single recommended next step. */
export function RecommendedNext({
  locale,
  recommendation,
}: {
  locale: Locale;
  recommendation: AdaptiveRecommendation | null;
}) {
  const t = getTranslator(locale, "adaptive");
  if (!recommendation) return null;
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{t("recommendedTitle")}</h2>
            <p className="text-sm">{recommendation.message}</p>
          </div>
          <Link
            href={`/${locale}/recommended`}
            className="tap-btn tap-btn-secondary tap-btn-sm"
          >
            {t("whySeeing")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
