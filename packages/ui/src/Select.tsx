import type { ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { cx } from "./cx";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Native select, styled — full keyboard + screen-reader support for free. */
export function Select({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? `tap-select-${autoId}`;
  const errorId = error ? `${selectId}-error` : undefined;
  return (
    <div className="tap-field">
      {label ? (
        <label className="tap-label" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <div className={cx("tap-input-wrap", error && "tap-input-invalid")}>
        <select
          id={selectId}
          className={cx("tap-input tap-select", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...rest}
        >
          {children}
        </select>
      </div>
      {hint && !error ? <p className="tap-hint">{hint}</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="tap-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
