import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "legendary";

const TONES: Record<BadgeTone, string> = {
  neutral: "tap-badge-neutral",
  primary: "tap-badge-primary",
  success: "tap-badge-success",
  warning: "tap-badge-warning",
  danger: "tap-badge-danger",
  legendary: "tap-badge-legendary",
};

/** Small status/label pill (incl. rarity tones for future badges). */
export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return <span className={cx("tap-badge", TONES[tone], className)}>{children}</span>;
}
