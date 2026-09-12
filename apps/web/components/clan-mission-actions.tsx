"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Start / refresh buttons for one clan mission run. */
export function ClanMissionActions({
  locale,
  missionId,
  status,
}: {
  locale: Locale;
  missionId: string;
  status: string;
}) {
  const t = getTranslator(locale, "clans");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function call(url: string): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error(`failed: ${String(res.status)}`);
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "available" ? (
        <button
          type="button"
          className="tap-btn tap-btn-primary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void call(`/api/clan/missions/${missionId}/start`);
          }}
        >
          {t("startMission")}
        </button>
      ) : null}
      {status === "active" ? (
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void call(`/api/clan/missions/${missionId}/sync`);
          }}
        >
          {t("syncMission")}
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
