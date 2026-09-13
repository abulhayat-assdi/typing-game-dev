"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin item controls: activate/deactivate (emergency disable). */
export function ShopAdminActions({
  locale,
  itemId,
  active,
}: {
  locale: Locale;
  itemId: string;
  active: boolean;
}) {
  const t = getTranslator(locale, "shop");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(action: "activate" | "deactivate"): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/shop/${itemId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      <button
        type="button"
        className="tap-btn tap-btn-secondary tap-btn-sm"
        disabled={busy}
        onClick={() => {
          void run(active ? "deactivate" : "activate");
        }}
      >
        {active ? t("deactivate") : t("activate")}
      </button>
    </div>
  );
}
