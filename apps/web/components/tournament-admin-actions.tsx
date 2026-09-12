"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTranslator, type Locale } from "../lib/i18n";

/** Admin tournament orchestration: lifecycle, seeding, rounds, finalize. */
export function TournamentAdminActions({
  locale,
  tournamentId,
  status,
}: {
  locale: Locale;
  tournamentId: string;
  status: string;
}) {
  const t = getTranslator(locale, "tournaments");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [method, setMethod] = useState("manual");
  const [order, setOrder] = useState("");
  const [randomSeed, setRandomSeed] = useState("");
  const [matchId, setMatchId] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [seasonId, setSeasonId] = useState("");

  async function call(action: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setFailed(false);
    try {
      const init: RequestInit =
        body === undefined
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            };
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/${action}`,
        init,
      );
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
    if (!ok) setFailed(true);
  }

  function seedBody(): Record<string, unknown> {
    if (method === "random") {
      const n = Number.parseInt(randomSeed, 10);
      return Number.isInteger(n) ? { method, seed: n } : { method };
    }
    if (method === "season_ranking") return { method };
    return {
      method: "manual",
      order: order
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    };
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="alert" className="text-sm text-red-600">
          {t("actionFailed")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(["publish", "close", "start", "advance", "finalize", "cancel"] as const).map(
          (a) => (
            <button
              key={a}
              type="button"
              className="tap-btn tap-btn-secondary tap-btn-sm"
              disabled={busy}
              onClick={() => {
                void run(a);
              }}
            >
              {t(a)}
            </button>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("seed")}
          <select
            className="tap-input"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
            }}
          >
            <option value="manual">manual</option>
            <option value="random">random</option>
            <option value="season_ranking">season_ranking</option>
          </select>
        </label>
        {method === "manual" ? (
          <label className="flex flex-col gap-1 text-sm">
            participant UUIDs (comma separated)
            <input
              className="tap-input"
              value={order}
              onChange={(e) => {
                setOrder(e.target.value);
              }}
            />
          </label>
        ) : null}
        {method === "random" ? (
          <label className="flex flex-col gap-1 text-sm">
            seed
            <input
              className="tap-input"
              value={randomSeed}
              onChange={(e) => {
                setRandomSeed(e.target.value);
              }}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("seed", seedBody());
          }}
        >
          {t("seed")}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          matchId
          <input
            className="tap-input"
            value={matchId}
            onChange={(e) => {
              setMatchId(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("open", { matchId: matchId.trim() });
          }}
        >
          open
        </button>
        <label className="flex flex-col gap-1 text-sm">
          scoreA
          <input
            className="tap-input"
            value={scoreA}
            onChange={(e) => {
              setScoreA(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          scoreB
          <input
            className="tap-input"
            value={scoreB}
            onChange={(e) => {
              setScoreB(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("finalize-match", {
              matchId: matchId.trim(),
              scoreA: Number(scoreA),
              scoreB: Number(scoreB),
            });
          }}
        >
          finalize-match
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          seasonId
          <input
            className="tap-input"
            value={seasonId}
            onChange={(e) => {
              setSeasonId(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-sm"
          disabled={busy}
          onClick={() => {
            void run("sync", { seasonId: seasonId.trim() });
          }}
        >
          {t("syncSeason")}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        {status === "finalized" ? t("finalizedNotice") : `${t("status")}: ${status}`}
      </p>
    </div>
  );
}
