import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { adaptivePageContext } from "../../../../lib/server/adaptive-pages";

/** Admin learning analytics: funnel, completion, global trends. */
export default async function AdminAdaptivePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "adaptive");
  const { store } = await adaptivePageContext(locale);
  let summary: Record<string, unknown> = {};
  try {
    summary = await store.globalSummary();
  } catch {
    summary = {};
  }

  const funnel =
    typeof summary.funnel === "object" && summary.funnel !== null
      ? (summary.funnel as Record<string, unknown>)
      : null;
  const games = Array.isArray(summary.game_completion)
    ? summary.game_completion.filter(
        (x): x is Record<string, unknown> =>
          typeof x === "object" && x !== null,
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("manageTitle")} description={t("globalTitle")} />
      <Card>
        <CardContent>
          <div className="flex gap-6 text-sm">
            <span>
              {t("funnelShown")}:{" "}
              {typeof funnel?.shown === "number" ? funnel.shown : "—"}
            </span>
            <span>
              {t("funnelStarted")}:{" "}
              {typeof funnel?.started === "number" ? funnel.started : "—"}
            </span>
            <span>
              {t("funnelCompleted")}:{" "}
              {typeof funnel?.completed === "number" ? funnel.completed : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
      {games.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-base font-bold">{t("gameCompletion")}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {games.slice(0, 10).map((g, i) => (
                <li key={typeof g.game_slug === "string" ? g.game_slug : i}>
                  {typeof g.game_slug === "string" ? g.game_slug : "game"} ·{" "}
                  {typeof g.completion === "number"
                    ? Math.round(g.completion * 10) / 10
                    : "—"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
