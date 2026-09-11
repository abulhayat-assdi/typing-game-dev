"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@tap/ui";

export interface PlayButtonStrings {
  play: string;
  starting: string;
  failed: string;
}

/** Starts a server attempt, then routes to the play shell. */
export function PlayButton({
  gameSlug,
  locale,
  strings: s,
}: {
  gameSlug: string;
  locale: string;
  strings: PlayButtonStrings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/games/${encodeURIComponent(gameSlug)}/attempts/start`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) throw new Error(`start failed: ${String(res.status)}`);
      const body = (await res.json()) as { attemptId?: string };
      if (typeof body.attemptId !== "string") throw new Error("bad response");
      router.push(`/${locale}/play/${body.attemptId}`);
    } catch {
      setError(s.failed);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="tap-btn tap-btn-primary tap-btn-lg"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => void start()}
      >
        {busy ? s.starting : s.play}
      </button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
