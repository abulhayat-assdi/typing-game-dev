import Link from "next/link";
import {
  AchievementBadge,
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  StatCard,
  XpProgress,
} from "@tap/ui";
import { isLocale } from "../../../../lib/i18n";
import { getTranslator } from "../../../../lib/i18n";
import { studentContext } from "../../../../lib/server/student-pages";
import { getStudentDashboard } from "../../../../lib/server/student";
import { WelcomeBanner } from "../../../../components/welcome-banner";
import { XpCounter } from "../../../../components/xp-counter";

export default async function DashboardPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "dashboard");
  const tp = getTranslator(locale, "profile");
  const { session, store } = await studentContext(locale);
  const data = await getStudentDashboard(session.userId, store);

  if (!data || !data.membership) {
    return (
      <EmptyState
        title={t("greeting")}
        description={t("noActivity")}
        action={
          <Link href={`/${locale}/games`} className="tap-btn tap-btn-primary tap-btn-md">
            {t("exploreGames")}
          </Link>
        }
      />
    );
  }

  const recommendedHref = data.recommended
    ? `/${locale}/games/${data.recommended.slug}`
    : `/${locale}/games`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("greeting")}
        description={`${data.membership.batchName} · ${data.membership.courseName}`}
        actions={
          <>
            <Link href={recommendedHref} className="tap-btn tap-btn-primary tap-btn-md">
              {t("continueAdventure")}
            </Link>
            <Link href={`/${locale}/games`} className="tap-btn tap-btn-secondary tap-btn-md">
              {t("exploreGames")}
            </Link>
          </>
        }
      />

      {data.isNew ? (
        <WelcomeBanner locale={locale} gameHref={recommendedHref} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("level")}
          value={<XpCounter value={data.profile.level} durationMs={0} />}
          hint={data.levelTitle}
        />
        <StatCard
          label={tp("currentStreak")}
          value={<XpCounter value={data.streak.current} />}
          hint={`${tp("bestStreak")}: ${String(data.streak.best)}`}
        />
        <StatCard
          label={t("averageWpm")}
          value={Math.round(data.averages.wpm)}
          hint={t("averageAccuracy") + ": " + String(Math.round(data.averages.accuracy)) + "%"}
        />
        <StatCard
          label={t("batchRank")}
          value={data.rank ? `#${String(data.rank.rank)}` : "—"}
          hint={
            data.rank
              ? t("ofStudents").replace("{count}", String(data.rank.total))
              : t("noActivity")
          }
        />
      </div>

      <Card>
        <CardContent>
          <XpProgress
            level={data.profile.level}
            current={data.profile.xpTotal}
            required={
              data.xpToNext === null
                ? data.profile.xpTotal
                : data.profile.xpTotal + data.xpToNext
            }
            label={t("nextMilestone")}
          />
          <p className="mt-2 text-sm text-ink-muted">
            {data.xpToNext === null
              ? t("maxLevel")
              : t("xpToNextLevel")
                  .replace("{xp}", String(data.xpToNext))
                  .replace("{level}", String(data.profile.level + 1))}
          </p>
        </CardContent>
      </Card>

      {data.latestBadge ? (
        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <AchievementBadge name={data.latestBadge.name} earned />
              <div>
                <p className="text-sm font-semibold">{t("latestBadge")}</p>
                <p>{data.latestBadge.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("recentActivity")}</h2>
          {data.recentAttempts.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noActivity")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.recentAttempts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium">{a.gameSlug}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={a.status === "validated" ? "success" : "neutral"}>
                      {a.status}
                    </Badge>
                    {a.score !== null ? <span>{a.score}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
