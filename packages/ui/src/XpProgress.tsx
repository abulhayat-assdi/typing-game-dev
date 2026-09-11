import type { ReactNode } from "react";
import { ProgressBar } from "./ProgressBar";
import { cx } from "./cx";

export interface XpProgressProps {
  level: ReactNode;
  current: number;
  required: number;
  label?: string;
  className?: string;
}

/**
 * XP-to-next-level visualization. Pure display: callers pass already-computed
 * numbers; no XP math or awarding lives here (or anywhere client-side).
 */
export function XpProgress({
  level,
  current,
  required,
  label,
  className,
}: XpProgressProps) {
  return (
    <div className={cx("tap-xp", className)}>
      <span className="tap-xp-level" aria-hidden="true">
        {level}
      </span>
      <div className="tap-xp-body">
        <ProgressBar value={current} max={Math.max(required, 1)} label={label} />
      </div>
    </div>
  );
}
