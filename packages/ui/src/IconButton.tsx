import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required since the button has no visible text. */
  label: string;
  children: ReactNode;
  tone?: "default" | "ghost";
}

/** Square icon-only button. Always labelled for screen readers. */
export function IconButton({
  label,
  tone = "default",
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "tap-icon-btn",
        tone === "ghost" && "tap-icon-btn-ghost",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
