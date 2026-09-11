import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "tap-btn-primary",
  secondary: "tap-btn-secondary",
  ghost: "tap-btn-ghost",
  danger: "tap-btn-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "tap-btn-sm",
  md: "tap-btn-md",
  lg: "tap-btn-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

/** Primary action button. `loading` disables + announces busy state. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const busy = disabled === true || loading;
  return (
    <button
      className={cx("tap-btn", VARIANTS[variant], SIZES[size], className)}
      disabled={busy}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="tap-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}
