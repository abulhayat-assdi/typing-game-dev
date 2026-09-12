import Link from "next/link";
import { Card, CardContent, EmptyState, PageHeader, ProgressBar } from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { seasonPageContext } from "../../../../lib/server/season-pages";
import { SeasonBoard } from "../../../../components/season-board";
import { CompetitionCountdown } from "../../../../components/competition-countdown";

/** Season hub: banner, countdown, my progress, boards, history. */
export default async function SeasonHubPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "seasons");
  const { session, store } = await seasonPageContext(locale);
  const seasons = await store.listSeasons();
  const active =
    seasons.find((s) => s.status === "active") ??
    seasons.find((s) => s.status === "processing") ??
    null;
  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("hubTitle")} description={t("hubSubtitle")} />
        <EmptyState title={t("hubTitle")} description={t("noActiveSeason")} />
        {seasons.length > 0 ? (
          <Card>
            <CardContent>
              <h2 className="mb-2 text-base font-bold">{t("sectionHistory")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {seasons.map((s) => (
                  <li key={s.id}>
                    <Link href={`/${locale}/season/${s.id}`}>
                      {s.name} · {s.status}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }
  const detail = await store.getSeason(active.id, session.userId);
  if (!detail) {
    return (
      <EmptyState title={t("hubTitle")} description={t("noActiveSeason")} />
    );
  }
  const serverNow = new Date().toISOString();
  const history = seasons.filter((s) => s.id !== active.id);

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
          <div className="mt-2">
            <ProgressBar
              value={detail.myPoints}
              max={Math.max(detail.myPoints, 1)}
              label={t("myPoints", { points: detail.myPoints })}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Link
              href={`/${locale}/season/leaderboard`}
              className="tap-btn tap-btn-secondary tap-btn-sm"
            >
              {t("sectionStudentBoard")}
            </Link>
            <Link
              href={`/${locale}/season/rewards`}
              className="tap-btn tap-btn-secondary tap-btn-sm"
            >
              {t("sectionRewards")}
            </Link>
          </div>
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
      {history.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-base font-bold">{t("sectionHistory")}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {history.map((s) => (
                <li key={s.id}>
                  <Link href={`/${locale}/season/${s.id}`}>
                    {s.name} · {s.status}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {detail.status === "finalized" ? (
        <p className="text-sm text-ink-muted">{t("finalNote")}</p>
      ) : null}
    </div>
  );
}
