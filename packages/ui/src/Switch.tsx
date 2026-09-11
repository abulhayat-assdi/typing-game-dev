"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
}

/** Toggle switch with role=switch semantics (Space/Enter native). */
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => { onCheckedChange(!checked); }}
      className={cx("tap-switch", checked && "tap-switch-on", className)}
      {...rest}
    >
      <span className="tap-switch-thumb" aria-hidden="true" />
      {label ? <span className="tap-switch-label">{label}</span> : null}
    </button>
  );
}
