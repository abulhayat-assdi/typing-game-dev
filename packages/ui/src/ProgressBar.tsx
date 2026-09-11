import { cx } from "./cx";

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string | undefined;
  className?: string;
}

/** Linear progress (clamped, announced via native progress semantics). */
export function ProgressBar({ value, max = 100, label, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));
  return (
    <div className={cx("tap-progress", className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="tap-progress-track"
      >
        <div className="tap-progress-fill" style={{ width: String(pct) + "%" }} />
      </div>
    </div>
  );
}
