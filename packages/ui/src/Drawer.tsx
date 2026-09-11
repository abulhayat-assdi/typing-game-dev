"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  side?: "left" | "right";
  closeLabel?: string;
}

/** Slide-over panel (controlled). Escape closes; backdrop click closes. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  closeLabel = "Close",
}: DrawerProps) {
  if (!open) return null;
  return (
    <div
      className="tap-scrim"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cx("tap-drawer", side === "left" && "tap-drawer-left")}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div className="tap-drawer-head">
          <h2 className="tap-drawer-title">{title}</h2>
          <button type="button" className="tap-link-btn" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        <div className="tap-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
