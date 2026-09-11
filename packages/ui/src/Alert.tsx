import type { ReactNode } from "react";
import { cx } from "./cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, string> = {
  info: "tap-alert-info",
  success: "tap-alert-success",
  warning: "tap-alert-warning",
  danger: "tap-alert-danger",
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Inline message banner (assertive for danger, polite otherwise). */
export function Alert({ tone = "info", title, children, className }: AlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("tap-alert", TONES[tone], className)}
    >
      {title ? <p className="tap-alert-title">{title}</p> : null}
      <div className="tap-alert-body">{children}</div>
    </div>
  );
}
