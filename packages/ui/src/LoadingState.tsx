import { Skeleton } from "./Skeleton";
import { cx } from "./cx";

export interface LoadingStateProps {
  label: string;
  className?: string;
}

/** Announced loading block (aria-busy + hidden skeleton art). */
export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cx("tap-state", className)}
    >
      <span className="tap-spinner tap-spinner-lg" aria-hidden="true" />
      <Skeleton lines={3} />
    </div>
  );
}
