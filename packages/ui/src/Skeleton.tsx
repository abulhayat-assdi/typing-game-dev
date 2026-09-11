import { cx } from "./cx";

export interface SkeletonProps {
  className?: string;
  lines?: number;
}

/**
 * Content placeholder. Pair with `aria-busy` + an aria-label on the parent;
 * the skeleton itself is hidden from assistive tech.
 */
export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cx("tap-skeleton-stack", className)}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <div key={i} className="tap-skeleton" />
      ))}
    </div>
  );
}
