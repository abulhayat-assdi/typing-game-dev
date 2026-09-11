import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Friendly placeholder for lists with zero items. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("tap-state", className)}>
      {icon ? (
        <div className="tap-state-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="tap-state-title">{title}</h3>
      {description ? <p className="tap-state-desc">{description}</p> : null}
      {action}
    </div>
  );
}
