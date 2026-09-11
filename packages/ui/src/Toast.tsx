"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cx } from "./cx";
import type { AlertTone } from "./Alert";

export interface ToastItem {
  id: string;
  tone: AlertTone;
  title?: string;
  message: ReactNode;
}

interface ToastContextValue {
  push: (toast: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export interface ToastProviderProps {
  children: ReactNode;
  /** Translated by the host app (defaults to English). */
  dismissLabel?: string;
}

/** Toast state provider — mount once near the app root. */
export function ToastProvider({
  children,
  dismissLabel = "Dismiss notification",
}: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    counter += 1;
    const id = "toast-" + String(counter);
    setItems((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);
  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="tap-toasts">
        {items.map((t) => (
          <div key={t.id} className={cx("tap-toast", `tap-toast-${t.tone}`)}>
            {t.title ? <p className="tap-toast-title">{t.title}</p> : null}
            <div>{t.message}</div>
            <button
              type="button"
              className="tap-link-btn"
              onClick={() => { dismiss(t.id); }}
              aria-label={dismissLabel}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
