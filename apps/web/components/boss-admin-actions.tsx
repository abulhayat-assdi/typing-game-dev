"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin battle controls: schedule, activate, advance, finalize. */
export function BossAdminActions({
  locale,
  bossId,
  status,
  instanceId,
  instanceStatus,
}: {
  locale: Locale;
  bossId?: string;
  status?: string;
  instanceId?: string;
  instanceStatus?: string;
}) {
  const t = getTranslator(locale, "bosses");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [clanId, setClanId] = useState("");

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(false);
    try {
      const init: RequestInit =
        body === undefined
          ? { method }
          : {
              method,
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

  return (
    <div className="flex flex-col gap-3">
      {bossId ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const ok = await call(
                  `/api/admin/bosses/${bossId}/${status === "active" ? "deactivate" : "activate"}`,
                  "POST",
                );
                if (!ok) setError(true);
              })();
            }}
          >
            {status === "active" ? t("deactivate") : t("activate")}
          </button>
        </div>
      ) : null}
      {bossId ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("fieldClan")}
            <input
              className="tap-input"
              value={clanId}
              placeholder="clan UUID"
              onChange={(e) => {
                setClanId(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy || !clanId.trim()}
            onClick={() => {
              void (async () => {
                const now = Date.now();
                const ok = await call("/api/admin/bosses/instances", "POST", {
                  bossId,
                  clanId: clanId.trim(),
                  startAt: new Date(now).toISOString(),
                  endAt: new Date(now + 48 * 3600_000).toISOString(),
                });
                if (ok) setClanId("");
                else setError(true);
              })();
            }}
          >
            {t("scheduleBattle")}
          </button>
        </div>
      ) : null}
      {instanceId ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const ok = await call(
                  `/api/admin/bosses/instances/${instanceId}/activate`,
                  "POST",
                );
                if (!ok) setError(true);
              })();
            }}
          >
            {t("activateBattle")}
          </button>
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const ok = await call(
                  `/api/admin/bosses/instances/${instanceId}/advance`,
                  "POST",
                );
                if (!ok) setError(true);
              })();
            }}
          >
            {t("advance")}
          </button>
          <button
            type="button"
            className="tap-btn tap-btn-secondary tap-btn-sm"
            disabled={busy || instanceStatus === "finalized"}
            onClick={() => {
              void (async () => {
                const ok = await call(
                  `/api/admin/bosses/instances/${instanceId}/finalize`,
                  "POST",
                );
                if (!ok) setError(true);
              })();
            }}
          >
            {t("finalizeBattle")}
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
