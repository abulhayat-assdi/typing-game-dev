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

/** Client action buttons for competitions (student + staff). */
export function CompetitionActions({
  locale,
  competitionId,
  actions,
}: {
  locale: Locale;
  competitionId: string;
  actions: (
    | "register"
    | "attachLatest"
    | "publish"
    | "open"
    | "close"
    | "finalize"
  )[];
}) {
  const t = getTranslator(locale, "competitions");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function run(action: string, url: string, body?: unknown) {
    setBusy(action);
    setError(false);
    const ok = await post(url, body);
    setBusy(null);
    if (!ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  const label: Record<string, string> = {
    register: t("register"),
    attachLatest: t("enterNow"),
    publish: t("publish"),
    open: t("openRegistration"),
    close: t("closeRegistration"),
    finalize: t("finalize"),
  };

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          className="tap-btn tap-btn-primary"
          disabled={busy !== null}
          onClick={() => {
            if (a === "register") {
              void run(a, `/api/competitions/${competitionId}/register`);
            } else if (a === "attachLatest") {
              void run(a, `/api/competitions/${competitionId}/attach`, {
                latest: true,
              });
            } else {
              void run(a, `/api/competitions/${competitionId}/${a}`);
            }
          }}
        >
          {busy === a ? "…" : label[a]}
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
