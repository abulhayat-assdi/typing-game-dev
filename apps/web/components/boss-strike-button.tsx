"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Strike button: bind one validated attempt as boss damage. */
export function BossStrikeButton({
  locale,
  instanceId,
  attemptId,
}: {
  locale: Locale;
  instanceId: string;
  attemptId: string | null;
}) {
  const t = getTranslator(locale, "bosses");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [damage, setDamage] = useState<number | null>(null);

  async function strike(): Promise<void> {
    if (!attemptId) {
      setError(true);
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/bosses/${encodeURIComponent(instanceId)}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId }),
        },
      );
      if (!res.ok) throw new Error(`strike failed: ${String(res.status)}`);
      const data = (await res.json()) as { damage?: unknown };
      setDamage(typeof data.damage === "number" ? data.damage : null);
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
        className="tap-btn tap-btn-primary tap-btn-lg"
        disabled={busy || !attemptId}
        aria-busy={busy || undefined}
        onClick={() => {
          void strike();
        }}
      >
        {t("submitLatest")}
      </button>
      {damage !== null ? (
        <p
          role="status"
          className="text-2xl font-bold motion-safe:animate-[mission-pop_600ms_ease-out]"
          key={String(damage)}
        >
          +{String(damage)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
