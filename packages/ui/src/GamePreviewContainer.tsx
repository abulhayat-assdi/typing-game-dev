import type { ReactNode } from "react";
import { cx } from "./cx";

export interface GamePreviewContainerProps {
  children: ReactNode;
  label: string;
  overlay?: ReactNode;
  className?: string;
}

/** Fixed-aspect stage for game previews/demos with an optional overlay. */
export function GamePreviewContainer({
  children,
  label,
  overlay,
  className,
}: GamePreviewContainerProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cx("tap-preview", className)}
    >
      {children}
      {overlay ? <div className="tap-preview-overlay">{overlay}</div> : null}
    </div>
  );
}
