import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";
import { cx } from "./cx";

export type MissionKind =
  | "learn"
  | "practice"
  | "trial"
  | "daily"
  | "boss"
  | "event";

export interface MissionCardProps {
  title: ReactNode;
  description?: ReactNode;
  kind?: MissionKind;
  kindLabel?: ReactNode;
  reward?: ReactNode;
  action?: ReactNode;
  complete?: boolean;
  className?: string;
}

const KIND_TONE: Record<MissionKind, BadgeTone> = {
  learn: "primary",
  practice: "neutral",
  trial: "warning",
  daily: "success",
  boss: "danger",
  event: "legendary",
};

/** Mission/quest card: kind pill, reward line, entry action. */
export function MissionCard({
  title,
  description,
  kind = "practice",
  kindLabel,
  reward,
  action,
  complete = false,
  className,
}: MissionCardProps) {
  return (
    <article className={cx("tap-mission", complete && "tap-mission-done", className)}>
      <div className="tap-mission-top">
        <h3 className="tap-mission-title">{title}</h3>
        {kindLabel ? <Badge tone={KIND_TONE[kind]}>{kindLabel}</Badge> : null}
      </div>
      {description ? <p className="tap-mission-desc">{description}</p> : null}
      {reward ? <p className="tap-mission-reward">{reward}</p> : null}
      {action}
    </article>
  );
}
