import { Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { adaptivePageContext } from "../../../../lib/server/adaptive-pages";
import { RecommendationCard } from "../../../../components/recommendation-card";
import { SkillOverview } from "../../../../components/skill-overview";

/** Recommended: personal plan with reasons, focus, and benefits. */
export default async function RecommendedPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "adaptive");
  const { store } = await adaptivePageContext(locale);
  const summary = await store.getSummary();
  const recommendations = summary?.recommendations ?? [];

  if (!summary || recommendations.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("recommendedTitle")}
          description={t("recommendedSubtitle")}
        />
        <EmptyState
          title={t("recommendedTitle")}
          description={t("noRecommendations")}
        />
      </div>
    );
  }

  const accuracy =
    summary.dimensions.find((d) => d.dimension === "accuracy")?.value ?? null;
  const wpm =
    summary.dimensions.find((d) => d.dimension === "wpm")?.value ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("recommendedTitle")}
        description={t("recommendedSubtitle")}
      />
      <SkillOverview
        locale={locale}
        accuracy={accuracy}
        wpm={wpm}
        trends={summary.trends}
        weaknesses={summary.weaknesses}
      />
      <div className="flex flex-col gap-3">
        {recommendations.map((r) => (
          <RecommendationCard key={r.id} locale={locale} recommendation={r} />
        ))}
      </div>
      <Card>
        <CardContent>
          <p className="text-xs text-ink-muted">
            {t("band")}: {summary.band}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
