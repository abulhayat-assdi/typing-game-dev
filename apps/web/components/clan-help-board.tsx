"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, ProgressBar } from "@tap/ui";
import { getTranslator, type Locale } from "../lib/i18n";
import type { HelpRequest } from "../lib/server/clan-store";

type StatusKey =
  | "helpOpen"
  | "helpPartial"
  | "helpFulfilled"
  | "helpExpired";

function statusKey(status: string): StatusKey {
  switch (status) {
    case "open":
      return "helpOpen";
    case "partially_fulfilled":
      return "helpPartial";
    case "fulfilled":
      return "helpFulfilled";
    case "expired":
      return "helpExpired";
    default:
      return "helpOpen";
  }
}

/** Help board: open requests, contribute action, bounded amounts. */
export function ClanHelpBoard({
  locale,
  requests,
}: {
  locale: Locale;
  requests: HelpRequest[];
}) {
  const t = getTranslator(locale, "clans");
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function post(url: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function ask(): Promise<void> {
    const n = Math.floor(Number(amount) || 0);
    if (n <= 0 || n > 50) {
      setError(true);
      return;
    }
    const ok = await post("/api/clan/help", {
      requested: n,
      context: context.trim() ? { note: context.trim() } : {},
    });
    if (ok) {
      setAmount("");
      setContext("");
    } else {
      setError(true);
    }
  }

  async function give(id: string): Promise<void> {
    const n = Math.floor(Number(amount) || 0);
    if (n <= 0) {
      setError(true);
      return;
    }
    const ok = await post(`/api/clan/help/${id}/contribute`, { amount: n });
    if (!ok) setError(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <h2 className="mb-2 text-base font-bold">{t("requestHelp")}</h2>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("helpContext")}
              <input
                className="tap-input"
                value={context}
                maxLength={120}
                onChange={(e) => {
                  setContext(e.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("helpAmount")}
              <input
                className="tap-input"
                type="number"
                min={1}
                max={50}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="tap-btn tap-btn-primary"
              disabled={busy}
              onClick={() => {
                void ask();
              }}
            >
              {t("requestHelp")}
            </button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("emptySection")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-bold">
                      {t(statusKey(r.status))}
                      {r.mine ? ` · ${t("myRequest")}` : ""}
                    </span>
                    <span className="text-ink-muted">
                      {t("helpProgress", {
                        done: r.fulfilled,
                        total: r.requested,
                      })}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar
                      value={r.fulfilled}
                      max={Math.max(r.requested, 1)}
                      label={t("helpProgress", {
                        done: r.fulfilled,
                        total: r.requested,
                      })}
                    />
                  </div>
                  {!r.mine &&
                  (r.status === "open" ||
                    r.status === "partially_fulfilled") ? (
                    <button
                      type="button"
                      className="tap-btn tap-btn-secondary tap-btn-sm mt-2"
                      disabled={busy}
                      onClick={() => {
                        void give(r.id);
                      }}
                    >
                      {t("contribute", { amount: amount || "…" })}
                    </button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
