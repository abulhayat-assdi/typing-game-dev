"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Direct clan challenge form (leaders only; DB enforces). */
export function WarChallengeForm({
  locale,
  opponents,
  games,
}: {
  locale: Locale;
  opponents: { clanId: string; name: string }[];
  games: { slug: string }[];
}) {
  const t = getTranslator(locale, "wars");
  const router = useRouter();
  const [defender, setDefender] = useState(opponents[0]?.clanId ?? "");
  const [game, setGame] = useState(games[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function challenge(): Promise<void> {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/wars", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defenderClanId: defender,
          gameSlugs: game ? [game] : [],
          scope: "same_course",
          prepHours: 2,
          battleHours: 2,
          attemptsPerPlayer: 5,
        }),
      });
      if (!res.ok) throw new Error(`challenge failed: ${String(res.status)}`);
      const data = (await res.json()) as { id?: string };
      if (typeof data.id !== "string") throw new Error("bad response");
      router.push(`/${locale}/clan/wars/${data.id}`);
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  if (opponents.length === 0 || games.length === 0) {
    return <p className="text-sm text-ink-muted">{t("emptySection")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        {t("pickOpponent")}
        <select
          className="tap-input"
          value={defender}
          onChange={(e) => {
            setDefender(e.target.value);
          }}
        >
          {opponents.map((o) => (
            <option key={o.clanId} value={o.clanId}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("allowedGames")}
        <select
          className="tap-input"
          value={game}
          onChange={(e) => {
            setGame(e.target.value);
          }}
        >
          {games.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.slug}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="tap-btn tap-btn-primary"
        disabled={busy || !defender || !game}
        onClick={() => {
          void challenge();
        }}
      >
        {t("challenge")}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
    </div>
  );
}
