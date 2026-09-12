"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Start-quest button: available → active via the API, then refresh. */
export function MissionStartButton({
  locale,
  instanceId,
  label,
}: {
  locale: Locale;
  instanceId: string;
  label?: string;
}) {
  const t = getTranslator(locale, "missions");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start(): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/missions/${encodeURIComponent(instanceId)}/start`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`start failed: ${String(res.status)}`);
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="tap-btn tap-btn-primary"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => {
          void start();
        }}
      >
        {busy ? "…" : (label ?? t("startQuest"))}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
