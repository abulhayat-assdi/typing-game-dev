import type { ReactNode } from "react";
import { cx } from "./cx";

export interface LockedGameCardProps {
  title: ReactNode;
  preview?: ReactNode;
  whyLocked: ReactNode[];
  requiredXp?: ReactNode;
  preparation?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Locked-game teaser: looks playable, plays nothing. Surfaces WHY locked,
 * required XP, prerequisite missions and preparation games — all supplied
 * as content by the caller. Gameplay stays disabled by the route guard.
 */
export function LockedGameCard({
  title,
  preview,
  whyLocked,
  requiredXp,
  preparation,
  action,
  className,
}: LockedGameCardProps) {
  return (
    <article
      className={cx("tap-locked", className)}
      aria-disabled="true"
      data-locked="true"
    >
      {preview ? (
        <div className="tap-locked-preview" aria-hidden="true">
          {preview}
          <span className="tap-locked-veil" />
        </div>
      ) : null}
      <div className="tap-locked-body">
        <h3 className="tap-locked-title">{title}</h3>
        <ul className="tap-locked-why">
          {whyLocked.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
        {requiredXp ? <p className="tap-locked-xp">{requiredXp}</p> : null}
        {preparation}
        {action}
      </div>
    </article>
  );
}
