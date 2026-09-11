"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Non-portal centered overlay card for focused tasks (forms, confirmations).
 * For Escape/backdrop semantics use Dialog; Modal stays deliberately simple
 * and fully controlled by the host.
 */
export function Modal({ title, children, actions, className }: ModalProps) {
  return (
    <div className="tap-scrim">
      <div role="dialog" aria-modal="true" className={cx("tap-modal", className)}>
        <h2 className="tap-modal-title">{title}</h2>
        <div className="tap-modal-body">{children}</div>
        {actions ? <div className="tap-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
