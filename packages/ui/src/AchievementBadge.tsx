import type { ReactNode } from "react";
import { cx } from "./cx";
import type { BadgeTone } from "./Badge";

export interface AchievementBadgeProps {
  name: ReactNode;
  icon?: ReactNode;
  rarity?: BadgeTone;
  earned?: boolean;
  className?: string;
}

/** Badge/achievement medallion (unearned renders dimmed silhouette). */
export function AchievementBadge({
  name,
  icon,
  rarity = "neutral",
  earned = true,
  className,
}: AchievementBadgeProps) {
  return (
    <figure
      className={cx(
        "tap-achievement",
        `tap-achievement-${rarity}`,
        !earned && "tap-achievement-locked",
        className,
      )}
    >
      <span className="tap-achievement-icon" aria-hidden="true">
        {icon ?? "★"}
      </span>
      <figcaption className="tap-achievement-name">{name}</figcaption>
    </figure>
  );
}
