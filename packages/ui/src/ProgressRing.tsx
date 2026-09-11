import { cx } from "./cx";

export interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  label?: string | undefined;
  className?: string;
}

/** Circular progress ring (SVG, screen-reader announced). */
export function ProgressRing({
  value,
  max = 100,
  size = 56,
  label,
  className,
}: ProgressRingProps) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx("tap-ring", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true">
        <circle cx="28" cy="28" r={r} className="tap-ring-track" />
        <circle
          cx="28"
          cy="28"
          r={r}
          className="tap-ring-fill"
          strokeDasharray={String((pct / 100) * c) + " " + String(c)}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
      </svg>
    </div>
  );
}
