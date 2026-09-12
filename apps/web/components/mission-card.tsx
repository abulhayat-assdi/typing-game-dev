import Link from "next/link";
import { MissionCard as UiMissionCard, ProgressBar } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { MissionInstance } from "../lib/server/mission-store";

type StatusKey =
  | "statusAvailable"
  | "statusActive"
  | "statusCompleted"
  | "statusLocked"
  | "statusExpired";

function statusTone(status: string): StatusKey {
  switch (status) {
    case "completed":
      return "statusCompleted";
    case "active":
      return "statusActive";
    case "available":
      return "statusAvailable";
    case "locked":
      return "statusLocked";
    case "expired":
      return "statusExpired";
    default:
      return "statusAvailable";
  }
}

/** Student mission card: adventure framing, progress, reward, CTA. */
export function StudentMissionCard({
  locale,
  mission,
}: {
  locale: Locale;
  mission: MissionInstance;
}) {
  const t = getTranslator(locale, "missions");
  const done = mission.objectives.filter((o) => o.completed).length;
  const total = mission.objectives.length;
  const kind =
    mission.period === "daily"
      ? "daily"
      : mission.period === "weekly"
        ? "trial"
        : "event";
  const cta =
    mission.status === "completed"
      ? null
      : mission.status === "active"
        ? t("continueQuest")
        : t("startQuest");
  return (
    <div className="flex flex-col gap-2">
      <UiMissionCard
        title={
          <Link href={`/${locale}/missions/${mission.instanceId}`}>
            {mission.title}
          </Link>
        }
        description={mission.description || undefined}
        kind={kind}
        kindLabel={t(statusTone(mission.status))}
        reward={t("rewardPreview", {
          xp: mission.rewardXp,
          coins: mission.rewardCoins,
        })}
        complete={mission.status === "completed"}
        action={
          cta ? (
            <Link
              href={`/${locale}/missions/${mission.instanceId}`}
              className="tap-btn tap-btn-primary tap-btn-sm"
            >
              {cta}
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-1" aria-label={t("detailsObjectives")}>
        {mission.objectives.map((o) => (
          <ProgressBar
            key={o.position}
            value={o.current}
            max={Math.max(o.target, 1)}
            label={t("progressOf", { done: o.current, total: o.target })}
          />
        ))}
        {total > 1 ? (
          <p className="text-xs text-ink-muted">
            {t("progressOf", { done, total })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
