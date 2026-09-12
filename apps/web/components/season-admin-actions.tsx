"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

const SOURCES = ["COMPETITION", "CLAN_WAR", "CLAN_BOSS", "MISSION"];

/** Admin season controls: lifecycle, sources, tiers. */
export function SeasonAdminActions({
  locale,
  seasonId,
  status,
}: {
  locale: Locale;
  seasonId: string;
  status: string;
}) {
  const t = getTranslator(locale, "seasons");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [source, setSource] = useState("MISSION");
  const [tier, setTier] = useState("Gold");
  const [minPoints, setMinPoints] = useState(200);

  async function call(action: string, body?: unknown): Promise<boolean> {
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
      const res = await fetch(`/api/admin/seasons/${seasonId}/${action}`, init);
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function run(action: string, body?: unknown): Promise<void> {
    const ok = await call(action, body);
    if (!ok) setError(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(["schedule", "activate", "cancel", "advance"] as const).map((a) => (
          <button
            key={a}
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              void run(a);
            }}
          >
            {a === "schedule"
              ? t("schedule")
              : a === "activate"
                ? t("activate")
                : a === "cancel"
                  ? t("cancelSeason")
                  : t("advance")}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("enableSource")}
          <select
            className="tap-input"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
            }}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("source", { source });
          }}
        >
          {t("enableSource")}
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("addTier")}
          <input
            className="tap-input"
            value={tier}
            onChange={(e) => {
              setTier(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("colPoints")}
          <input
            className="tap-input"
            type="number"
            min={0}
            value={minPoints}
            onChange={(e) => {
              setMinPoints(Math.max(0, Number(e.target.value) || 0));
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy || !tier.trim()}
          onClick={() => {
            void run("tier", { tier: tier.trim(), minPoints });
          }}
        >
          {t("addTier")}
        </button>
      </div>
      <p className="text-sm text-ink-muted">
        {t("statusDraft")}: {status}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
