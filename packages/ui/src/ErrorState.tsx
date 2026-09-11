import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ErrorStateProps {
  title: ReactNode;
  description?: ReactNode;
  retryLabel?: ReactNode;
  onRetry?: () => void;
  className?: string;
}

/** Full-block failure state with an optional retry action. */
export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cx("tap-state", className)}>
      <h3 className="tap-state-title">{title}</h3>
      {description ? <p className="tap-state-desc">{description}</p> : null}
      {onRetry && retryLabel ? (
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-md"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
