import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: string;
}

/** Labelled radio option (group via shared `name`). */
export function Radio({ label, hint, className, ...rest }: RadioProps) {
  return (
    <label className={cx("tap-check", className)}>
      <input type="radio" className="tap-radio-dot" {...rest} />
      <span className="tap-check-body">
        <span className="tap-check-label">{label}</span>
        {hint ? <span className="tap-hint">{hint}</span> : null}
      </span>
    </label>
  );
}
