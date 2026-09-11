import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cx } from "./cx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  startSlot?: ReactNode;
  endSlot?: ReactNode;
}

/**
 * Labelled text input with hint/error slots. `error` wires aria-invalid +
 * aria-describedby automatically; pass matching `id` or let it generate one.
 */
export function Input({
  label,
  hint,
  error,
  startSlot,
  endSlot,
  id,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? `tap-input-${autoId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="tap-field">
      {label ? (
        <label className="tap-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className={cx("tap-input-wrap", error && "tap-input-invalid")}>
        {startSlot}
        <input
          id={inputId}
          className={cx("tap-input", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...rest}
        />
        {endSlot}
      </div>
      {hint && !error ? (
        <p id={hintId} className="tap-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="tap-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
