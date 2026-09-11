import {
  AchievementBadge,
  Avatar,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  StatCard,
} from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { studentContext } from "../../../../lib/server/student-pages";
import { getStudentProfile } from "../../../../lib/server/student";

export default async function ProfilePage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "profile");
  const { session, store } = await studentContext(locale);
  const p = await getStudentProfile(session.userId, store);

  if (!p) {
    return <EmptyState title={t("title")} description={t("noRecords")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={p.fullName}
        description={`${t("rollNumber")}: ${p.rollNumber} · ${p.batchName} · ${p.courseName}`}
      />

      <div className="flex items-center gap-4">
        <Avatar name={p.fullName} size="lg" />
        <div>
          <p className="text-lg font-bold">
            {t("level")} {p.level}
          </p>
          <p className="text-sm text-ink-muted">
            {t("totalXp")}: {p.xpTotal} · {t("coins")}: {p.coins}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("currentStreak")}
          value={p.streak.current}
          hint={`${t("bestStreak")}: ${String(p.streak.best)}`}
        />
        <StatCard label={t("averageWpm")} value={Math.round(p.averages.wpm)} />
        <StatCard
          label={t("averageAccuracy")}
          value={`${String(Math.round(p.averages.accuracy))}%`}
        />
        <StatCard label={t("gamesCompleted")} value={p.gamesCompleted} />
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("badges")}</h2>
          {p.badges.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noBadges")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {p.badges.map((b) => (
                <AchievementBadge key={b.slug} name={b.name} earned />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("achievements")}</h2>
          {p.achievements.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noRecords")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {p.achievements.map((a) => (
                <li key={a.slug} className="flex justify-between gap-3">
                  <span>{a.name}</span>
                  <span className="font-semibold">{a.value}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("personalRecords")}</h2>
          {p.records.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noRecords")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {p.records.slice(0, 12).map((r) => (
                <li key={`${r.gameSlug}-${r.metric}`} className="flex justify-between gap-3">
                  <span>
                    {r.gameSlug} · {r.metric}
                  </span>
                  <span className="font-semibold">{Math.round(r.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
