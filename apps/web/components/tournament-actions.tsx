"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Student entry controls: register / withdraw for one tournament. */
export function TournamentActions({
  locale,
  tournamentId,
  registered,
  open,
}: {
  locale: Locale;
  tournamentId: string;
  registered: boolean;
  open: boolean;
}) {
  const t = getTranslator(locale, "tournaments");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(path: "register" | "withdraw"): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
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

  if (!open) {
    return (
      <p className="text-sm text-ink-muted">
        {registered ? t("registered") : t("ineligibleNotice")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      {registered ? (
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("withdraw");
          }}
        >
          {t("withdraw")}
        </button>
      ) : (
        <button
          type="button"
          className="tap-btn tap-btn-primary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("register");
          }}
        >
          {t("register")}
        </button>
      )}
    </div>
  );
}
