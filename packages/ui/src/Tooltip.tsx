import type { ReactNode } from "react";
import { cx } from "./cx";

export interface TooltipProps {
  tip: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom";
}

/**
 * CSS-only tooltip (hover + keyboard-focus reveal it via :focus-within).
 * Server-safe. The trigger must itself be focusable (button/link/input)
 * for keyboard users.
 */
export function Tooltip({ tip, children, position = "top" }: TooltipProps) {
  return (
    <span className={cx("tap-tip", position === "bottom" && "tap-tip-bottom")}>
      {children}
      <span className="tap-tip-bubble" role="tooltip">
        {tip}
      </span>
    </span>
  );
}
