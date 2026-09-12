import Link from "next/link";
import { Card, CardContent, ProgressBar, RewardCard } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { MissionInstance } from "../lib/server/mission-store";

/**
 * Completion moment: reward reveal with motion-safe animation only
 * (no motion when the OS requests reduced motion). Issuance stays
 * server-side; this is presentation of an already-awarded mission.
 */
export function MissionRewardMoment({
  locale,
  mission,
}: {
  locale: Locale;
  mission: MissionInstance;
}) {
  const t = getTranslator(locale, "missions");
  return (
    <div className="motion-safe:animate-[mission-pop_600ms_ease-out]">
      <RewardCard
        title={t("completedTitle")}
        description={t("completedBody")}
        amount={t("rewardPreview", {
          xp: mission.rewardXp,
          coins: mission.rewardCoins,
        })}
        claimed
        claimedLabel={t("statusCompleted")}
      />
    </div>
  );
}

/** Dashboard widgets: today's progress + weekly challenge at a glance. */
export function MissionWidgets({
  locale,
  daily,
  weekly,
}: {
  locale: Locale;
  daily: MissionInstance[];
  weekly: MissionInstance[];
}) {
  const t = getTranslator(locale, "missions");
  const doneDaily = daily.filter((m) => m.status === "completed").length;
  const firstWeekly = weekly[0] ?? null;
  const weeklyDone =
    firstWeekly?.objectives.filter((o) => o.completed).length ?? 0;
  const weeklyTotal = firstWeekly?.objectives.length ?? 0;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">{t("dashboardToday")}</h2>
            <Link
              href={`/${locale}/missions`}
              className="tap-btn tap-btn-secondary tap-btn-sm"
            >
              {t("viewAll")}
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {t("dashboardProgress", { done: doneDaily, total: daily.length })}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {daily.slice(0, 3).map((m) => {
              const target = m.objectives.reduce(
                (s, o) => s + Math.max(o.target, 1),
                0,
              );
              const current = m.objectives.reduce(
                (s, o) => s + Math.min(o.current, Math.max(o.target, 1)),
                0,
              );
              return (
                <ProgressBar
                  key={m.instanceId}
                  value={current}
                  max={Math.max(target, 1)}
                  label={m.title}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="text-base font-bold">{t("dashboardWeekly")}</h2>
          {firstWeekly ? (
            <>
              <p className="mt-1 text-sm">{firstWeekly.title}</p>
              <div className="mt-2">
                <ProgressBar
                  value={weeklyDone}
                  max={Math.max(weeklyTotal, 1)}
                  label={t("progressOf", {
                    done: weeklyDone,
                    total: weeklyTotal,
                  })}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">{t("emptySection")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
