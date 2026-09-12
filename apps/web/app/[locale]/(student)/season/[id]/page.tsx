import { notFound } from "next/navigation";
import { Card, CardContent, PageHeader } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../../lib/i18n";
import { seasonPageContext } from "../../../../../lib/server/season-pages";
import { SeasonBoard } from "../../../../../components/season-board";
import { CompetitionCountdown } from "../../../../../components/competition-countdown";

/** Season detail / history view (works for active and finalized). */
export default async function SeasonDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { session, store } = await seasonPageContext(locale);
  const detail = await store.getSeason(params.id, session.userId);
  if (!detail) notFound();
  const serverNow = new Date().toISOString();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={detail.name} description={detail.theme} />
      {detail.status === "active" ? (
        <>
          <CompetitionCountdown
            serverNowIso={serverNow}
            targetIso={detail.endAt}
            label={t("timeLeft", { time: "" }).replace(/:\s*$/, "")}
          />
          <p className="text-xs text-ink-muted">{t("serverTimeNote")}</p>
        </>
      ) : null}
      <Card>
        <CardContent>
          <p className="text-sm font-bold">
            {t("myPoints", { points: detail.myPoints })}
            {detail.myRank === null
              ? ""
              : ` · ${t("myRank", { rank: detail.myRank })}`}
            {detail.myTier === null
              ? ""
              : ` · ${t("myTier", { tier: detail.myTier })}`}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionStudentBoard")}</h2>
          <SeasonBoard locale={locale} rows={detail.studentBoard} clan={false} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("sectionClanBoard")}</h2>
          <SeasonBoard locale={locale} rows={detail.clanBoard} clan={true} />
        </CardContent>
      </Card>
      {detail.status === "finalized" ? (
        <p className="text-sm text-ink-muted">{t("finalNote")}</p>
      ) : null}
    </div>
  );
}
