"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Activate/deactivate + add-objective controls for one mission. */
export function MissionAdminActions({
  locale,
  missionId,
  status,
}: {
  locale: Locale;
  missionId: string;
  status: string;
}) {
  const t = getTranslator(locale, "missions");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState("GAMES_COMPLETED");
  const [count, setCount] = useState(1);

  async function call(url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(false);
    try {
      const init: RequestInit =
        body === undefined
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            };
      const res = await fetch(url, init);
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(): Promise<void> {
    const action = status === "active" ? "deactivate" : "activate";
    const ok = await call(`/api/admin/missions/${missionId}/${action}`);
    if (!ok) setError(true);
  }

  async function addObjective(): Promise<void> {
    const ok = await call(`/api/admin/missions/${missionId}/objectives`, {
      kind,
      target: { count },
    });
    if (!ok) setError(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="tap-btn tap-btn-primary"
        disabled={busy}
        onClick={() => {
          void toggle();
        }}
      >
        {status === "active" ? t("deactivate") : t("activate")}
      </button>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("fieldObjectiveKind")}
          <select
            className="tap-input"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
            }}
          >
            {[
              "GAMES_COMPLETED",
              "ACCURACY_REACHED",
              "WPM_REACHED",
              "SCORE_REACHED",
              "CHARS_TYPED",
              "WORDS_TYPED",
              "PERFECT_RUN",
              "DISTINCT_GAMES",
              "PERSONAL_BEST",
              "WORLD_GAMES",
            ].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("fieldTargetCount")}
          <input
            className="tap-input"
            type="number"
            min={1}
            value={count}
            onChange={(e) => {
              setCount(Math.max(1, Number(e.target.value) || 1));
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary"
          disabled={busy}
          onClick={() => {
            void addObjective();
          }}
        >
          {t("addObjective")}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
