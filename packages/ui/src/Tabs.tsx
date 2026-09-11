"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface Tab {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

/** Accessible tabs (arrow-key navigation, aria tab semantics). */
export function Tabs({ tabs, initial = 0 }: { tabs: Tab[]; initial?: number }) {
  const base = useId();
  const [selected, setSelected] = useState(
    Math.min(Math.max(initial, 0), tabs.length - 1),
  );
  const current = tabs[selected];
  if (!current) return null;
  return (
    <div className="tap-tabs">
      <div role="tablist" aria-label="Tabs" className="tap-tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={i === selected}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === selected ? 0 : -1}
            disabled={t.disabled}
            className={cx("tap-tab", i === selected && "tap-tab-active")}
            onClick={() => { setSelected(i); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                setSelected((s) => (s + 1) % tabs.length);
              }
              if (e.key === "ArrowLeft") {
                setSelected((s) => (s - 1 + tabs.length) % tabs.length);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${current.id}`}
        aria-labelledby={`${base}-tab-${current.id}`}
        className="tap-tabpanel"
      >
        {current.panel}
      </div>
    </div>
  );
}
