import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: string;
}

/** Labelled checkbox with a large touch target. */
export function Checkbox({ label, hint, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx("tap-check", className)}>
      <input type="checkbox" className="tap-check-box" {...rest} />
      <span className="tap-check-body">
        <span className="tap-check-label">{label}</span>
        {hint ? <span className="tap-hint">{hint}</span> : null}
      </span>
    </label>
  );
}
