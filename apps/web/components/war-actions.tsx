"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

async function post(url: string, body?: unknown): Promise<boolean> {
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
    return res.ok;
  } catch {
    return false;
  }
}

/** War action buttons (challenge flow + battle actions). */
export function WarActions({
  locale,
  warId,
  actions,
  attemptId,
}: {
  locale: Locale;
  warId: string;
  actions: (
    | "dispatch"
    | "accept"
    | "decline"
    | "cancel"
    | "advance"
    | "sync"
    | "finalize"
    | "submit"
  )[];
  attemptId?: string;
}) {
  const t = getTranslator(locale, "wars");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run(action: string): Promise<void> {
    setBusy(true);
    setError(false);
    let ok = false;
    if (action === "accept") {
      ok = await post(`/api/wars/${warId}/accept`, { accept: true });
    } else if (action === "decline") {
      ok = await post(`/api/wars/${warId}/accept`, { accept: false });
    } else if (action === "submit") {
      if (!attemptId) {
        setError(true);
        setBusy(false);
        return;
      }
      ok = await post(`/api/wars/${warId}/submit`, { attemptId });
    } else {
      ok = await post(`/api/wars/${warId}/${action}`);
    }
    setBusy(false);
    if (!ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  const label: Record<string, string> = {
    dispatch: t("challenge"),
    accept: t("accept"),
    decline: t("decline"),
    cancel: t("cancelWar"),
    advance: t("advance"),
    sync: t("syncNow"),
    finalize: t("finalize"),
    submit: t("submitLatest"),
  };

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          className="tap-btn tap-btn-primary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run(a);
          }}
        >
          {label[a]}
        </button>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
