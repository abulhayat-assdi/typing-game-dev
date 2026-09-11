"use client";

import { useState } from "react";
import { Input, type InputProps } from "./Input";

export interface PasswordInputProps extends Omit<InputProps, "type" | "endSlot"> {
  showLabel?: string;
  hideLabel?: string;
}

/** Password input with a show/hide toggle (keyboard accessible). */
export function PasswordInput({
  showLabel = "Show password",
  hideLabel = "Hide password",
  ...rest
}: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      type={shown ? "text" : "password"}
      endSlot={
        <button
          type="button"
          className="tap-link-btn"
          aria-pressed={shown}
          aria-label={shown ? hideLabel : showLabel}
          onClick={() => { setShown((v) => !v); }}
        >
          {shown ? hideLabel : showLabel}
        </button>
      }
      {...rest}
    />
  );
}
