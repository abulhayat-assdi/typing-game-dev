"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { cx } from "./cx";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  labelledBy?: string;
}

/**
 * Modal dialog built on the native <dialog> element: focus containment,
 * Escape handling and ::backdrop come from the platform.
 */
export function Dialog({ open, onClose, title, children, labelledBy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const autoId = useId();
  const titleId = labelledBy ?? `tap-dialog-${autoId}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open ]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => { el.removeEventListener("cancel", onCancel); };
  }, [onClose]);

  return (
    <dialog ref={ref} aria-labelledby={titleId} className={cx("tap-dialog")}>
      <div className="tap-dialog-head">
        <h2 id={titleId} className="tap-dialog-title">
          {title}
        </h2>
      </div>
      <div className="tap-dialog-body">{children}</div>
    </dialog>
  );
}
