import type { ReactNode } from "react";
import { cx } from "./cx";

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** Single metric tile (XP, WPM, streak — values supplied by callers). */
export function StatCard({ label, value, hint, icon, className }: StatCardProps) {
  return (
    <div className={cx("tap-stat", className)}>
      <div className="tap-stat-top">
        <p className="tap-stat-label">{label}</p>
        {icon ? (
          <span className="tap-stat-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="tap-stat-value">{value}</p>
      {hint ? <p className="tap-stat-hint">{hint}</p> : null}
    </div>
  );
}
