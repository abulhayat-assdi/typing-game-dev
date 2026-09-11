import {
  AchievementBadge,
  Card,
  CardContent,
  PageHeader,
} from "@tap/ui";
import { isLocale, getTranslator } from "../../../../lib/i18n";
import { studentContext } from "../../../../lib/server/student-pages";
import { getProgressData } from "../../../../lib/server/student";

export default async function ProgressPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getTranslator(locale, "progress");
  const { session, store } = await studentContext(locale);
  const data = await getProgressData(session.userId, store);

  if (!data) {
    return <PageHeader title={t("title")} description={t("noHistory")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("xpHistory")}</h2>
          {data.xpHistory.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noHistory")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.xpHistory.slice(0, 15).map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{e.reason || t("xpGain").replace("{xp}", String(e.amount))}</span>
                  <span className="font-semibold">
                    +{e.amount} XP · {e.createdAt.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("achievements")}</h2>
          {data.achievements.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noHistory")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.achievements.map((a) => (
                <AchievementBadge key={a.slug} name={a.name} earned />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("records")}</h2>
          {data.records.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noHistory")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.records.slice(0, 15).map((r) => (
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

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-bold">{t("streakHistory")}</h2>
          {data.activeDays.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noHistory")}</p>
          ) : (
            <p className="text-sm">
              {data.activeDays.slice(0, 30).join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
