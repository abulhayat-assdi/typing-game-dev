"use client";

import { useState } from "react";
import { Alert } from "@tap/ui";
import {
  GamePlayer,
  type PlayStrings,
  type SubmitSnapshot,
  type ValidatedResult,
} from "./game-player";
import { ResultScreen, type ResultStrings } from "./result-screen";

export interface PlayExperienceStrings {
  play: PlayStrings;
  result: ResultStrings;
}

/**
 * Orchestrates play → submit → server-truth result. Never invents numbers:
 * the result view renders only the submit response (+ a records lookup for
 * the personal-best flag).
 */
export function PlayExperience({
  attemptId,
  gameSlug,
  gameTitle,
  expectedText,
  timingKind,
  timingLimit,
  strings,
  gameHref,
  mapHref,
  dashboardHref,
}: {
  attemptId: string;
  gameSlug: string;
  gameTitle: string;
  expectedText: string;
  timingKind: string;
  timingLimit: number | null;
  strings: PlayExperienceStrings;
  gameHref: string;
  mapHref: string;
  dashboardHref: string;
}) {
  const [done, setDone] = useState<{
    result: ValidatedResult;
    snap: SubmitSnapshot;
    isPB: boolean;
  } | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  if (done) {
    return (
      <ResultScreen
        result={done.result}
        snap={done.snap}
        isPB={done.isPB}
        strings={strings.result}
        gameHref={gameHref}
        mapHref={mapHref}
        dashboardHref={dashboardHref}
      />
    );
  }

  if (rejected) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Alert tone="warning" title={strings.result.rejectedTitle}>
          {strings.result.rejectedDescription.replace("{reason}", rejected)}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <a href={gameHref} className="tap-btn tap-btn-secondary tap-btn-md">
            {strings.result.playAgain}
          </a>
          <a href={mapHref} className="tap-btn tap-btn-primary tap-btn-md">
            {strings.result.backToMap}
          </a>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Alert tone="warning" title={strings.result.expiredTitle}>
          {strings.result.expiredDescription}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <a href={gameHref} className="tap-btn tap-btn-secondary tap-btn-md">
            {strings.result.playAgain}
          </a>
          <a href={mapHref} className="tap-btn tap-btn-primary tap-btn-md">
            {strings.result.backToMap}
          </a>
        </div>
      </div>
    );
  }

  return (
    <GamePlayer
      attemptId={attemptId}
      gameSlug={gameSlug}
      gameTitle={gameTitle}
      expectedText={expectedText}
      timingKind={timingKind}
      timingLimit={timingLimit}
      strings={strings.play}
      backHref={gameHref}
      onDone={(result, snap, extra) => {
        if (result) {
          // Personal-best flag: does any stored record point at this attempt?
          void fetch(
            `/api/games/${encodeURIComponent(gameSlug)}/records`,
            { credentials: "same-origin" },
          )
            .then((r) => (r.ok ? r.json() : { records: [] }))
            .then((body: unknown) => {
              const records =
                typeof body === "object" && body !== null && Array.isArray((body as { records?: unknown }).records)
                  ? ((body as { records: Array<{ attemptId?: unknown }> }).records)
                  : [];
              const isPB = records.some((r) => r.attemptId === attemptId);
              setDone({ result, snap, isPB });
            })
            .catch(() => { setDone({ result, snap, isPB: false }); });
        } else if (extra.expired) {
          setExpired(true);
        } else {
          setRejected(extra.rejectedReason ?? "REJECTED");
        }
      }}
    />
  );
}
