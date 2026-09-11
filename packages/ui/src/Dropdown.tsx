"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface DropdownItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface DropdownProps {
  label: ReactNode;
  items: DropdownItem[];
  onSelect: (id: string) => void;
}

/** Minimal menu button (Escape closes, arrows move, Enter picks). */
export function Dropdown({ label, items, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();

  const pick = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    setOpen(false);
    onSelect(item.id);
  };

  return (
    <div className="tap-dropdown">
      <button
        type="button"
        className="tap-btn tap-btn-secondary tap-btn-md"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => { setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive(0);
          }
        }}
      >
        {label}
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="tap-menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === "Enter") pick(active);
          }}
        >
          {items.map((item, i) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={i === active ? 0 : -1}
                className={cx("tap-menu-item", i === active && "tap-menu-active")}
                onClick={() => { pick(i); }}
                onMouseEnter={() => { setActive(i); }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
