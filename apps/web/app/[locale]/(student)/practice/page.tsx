import Link from "next/link";
import { Card, CardContent, EmptyState, PageHeader } from "@tap/ui";
import { PROMPT_SETS } from "@tap/content";
import { buildPracticeDrill } from "@tap/adaptive";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { adaptivePageContext } from "../../../../lib/server/adaptive-pages";
import { PracticeDrillCard } from "../../../../components/practice-drill";

function contentLists(): { words: string[]; sentences: string[] } {
  const words: string[] = [];
  const sentences: string[] = [];
  for (const set of Object.values(PROMPT_SETS)) {
    if (!Array.isArray(set.items)) continue;
    const items = set.items.filter((x): x is string => typeof x === "string");
    if (set.kind === "words") words.push(...items);
    if (set.kind === "sentences") sentences.push(...items);
  }
  return { words, sentences };
}

/** Personal practice: quick actions plus a curated weak-key drill. */
export default async function PracticePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "adaptive");
  const { store } = await adaptivePageContext(locale);
  const summary = await store.getSummary();
  const recommendations = summary?.recommendations ?? [];
  const weakKeys = (summary?.weaknesses ?? [])
    .filter((w) => w.type === "key")
    .slice(0, 4)
    .map((w) => w.target);
  const drill =
    weakKeys.length > 0 ? buildPracticeDrill(weakKeys, contentLists()) : null;
  const top = recommendations[0] ?? null;

  const actions = [
    { key: "need-most", label: t("needMost"), game: top?.gameSlug ?? null },
    { key: "weak-keys", label: t("weakKeys"), game: top?.gameSlug ?? null },
    {
      key: "accuracy",
      label: t("accuracy"),
      game:
        recommendations.find((r) => r.reason === "LOW_ACCURACY")?.gameSlug ??
        top?.gameSlug ??
        null,
    },
    {
      key: "speed",
      label: t("speed"),
      game:
        recommendations.find((r) => r.reason === "LOW_WPM")?.gameSlug ??
        top?.gameSlug ??
        null,
    },
    { key: "sentences", label: t("sentences"), game: top?.gameSlug ?? null },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("practiceTitle")} description={t("practiceSubtitle")} />
      {recommendations.length === 0 ? (
        <EmptyState
          title={t("practiceTitle")}
          description={t("noRecommendations")}
        />
      ) : null}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-2">
            {actions.map((a) =>
              a.game ? (
                <Link
                  key={a.key}
                  href={`/${locale}/games/${a.game}`}
                  className="tap-btn tap-btn-secondary tap-btn-sm"
                >
                  {a.label}
                </Link>
              ) : null,
            )}
          </div>
        </CardContent>
      </Card>
      {drill ? <PracticeDrillCard locale={locale} drill={drill} /> : null}
    </div>
  );
}
