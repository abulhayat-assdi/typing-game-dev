import type { ReactNode } from "react";
import { cx } from "./cx";

export interface AdventureMapContainerProps {
  children: ReactNode;
  label: string;
  className?: string;
}

/**
 * Positioning board for the world map: relative container with a decorative
 * path layer behind absolutely-positioned node slots (supplied by callers).
 */
export function AdventureMapContainer({
  children,
  label,
  className,
}: AdventureMapContainerProps) {
  return (
    <section aria-label={label} className={cx("tap-map", className)}>
      <div className="tap-map-path" aria-hidden="true" />
      <div className="tap-map-nodes">{children}</div>
    </section>
  );
}
