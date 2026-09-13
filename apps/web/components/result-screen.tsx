import Link from "next/link";
import { AchievementBadge, Badge, Card, CardContent, StatCard } from "@tap/ui";
import type { SubmitSnapshot, ValidatedResult } from "./game-player";

export interface ResultStrings {
  title: string;
  subtitle: string;
  wpm: string;
  accuracy: string;
  score: string;
  duration: string;
  errors: string;
  corrected: string;
  personalBest: string;
  xpEarned: string;
  coinsEarned: string;
  levelUp: string;
  badgeEarned: string;
  streakKept: string;
  unlocked: string;
  playAgain: string;
  backToMap: string;
  continueAdventure: string;
  rejectedTitle: string;
  rejectedDescription: string;
  expiredTitle: string;
  expiredDescription: string;
}

/**
 * Server-truth result screen. Every reward number arrives from the submit
 * response; run stats (duration/errors) are client-measured context only.
 */
export function ResultScreen({
  result,
  snap,
  isPB,
  strings: s,
  gameHref,
  mapHref,
  dashboardHref,
  recoveryHref,
  recoveryLabel,
}: {
  result: ValidatedResult;
  snap: SubmitSnapshot | null;
  isPB: boolean;
  strings: ResultStrings;
  gameHref: string;
  mapHref: string;
  dashboardHref: string;
  /**
   * Optional rewarded-recovery path (M17). The ordinary retry link
   * always renders; the ad path is an extra, never the only route.
   */
  recoveryHref?: string | null;
  recoveryLabel?: string | null;
}) {
  const p = result.progression;
  const seconds = snap ? Math.max(0, Math.round(snap.elapsedMs / 1000)) : null;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="text-center">
        <h1 className="font-display text-3xl font-extrabold">{s.title}</h1>
        <p className="mt-1 text-ink-muted">{s.subtitle}</p>
        {isPB ? (
          <p className="mt-2">
            <Badge tone="legendary">{s.personalBest}</Badge>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={s.wpm} value={Math.round(result.effectiveWpm)} />
        <StatCard
          label={s.accuracy}
          value={`${String(Math.round(result.accuracy))}%`}
        />
        <StatCard label={s.score} value={Math.round(result.score)} />
      </div>
      {snap ? (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={s.duration} value={`${String(seconds)}s`} />
          <StatCard label={s.errors} value={snap.incorrectChars} />
          <StatCard label={s.corrected} value={snap.corrections} />
        </div>
      ) : null}

      {p ? (
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">
                {s.xpEarned.replace("{xp}", String(p.xp))}
              </Badge>
              {p.coins > 0 ? (
                <Badge tone="warning">
                  {s.coinsEarned.replace("{coins}", String(p.coins))}
                </Badge>
              ) : null}
              {p.leveledUp ? (
                <Badge tone="legendary">
                  {s.levelUp.replace("{level}", String(p.level))}
                </Badge>
              ) : null}
              {p.streakCurrent > 0 ? (
                <Badge tone="success">{s.streakKept}</Badge>
              ) : null}
            </div>
            {p.newBadges.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-bold">{s.badgeEarned}</p>
                <div className="flex flex-wrap gap-3">
                  {p.newBadges.map((b) => (
                    <AchievementBadge key={b.slug} name={b.name} earned />
                  ))}
                </div>
              </div>
            ) : null}
            {p.unlocked.length > 0 ? (
              <p className="mt-3 text-sm">
                {s.unlocked}: {p.unlocked.length}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Link href={gameHref} className="tap-btn tap-btn-secondary tap-btn-md">
          {s.playAgain}
        </Link>
        {recoveryHref && recoveryLabel ? (
          <Link
            href={recoveryHref}
            className="tap-btn tap-btn-secondary tap-btn-md"
          >
            {recoveryLabel}
          </Link>
        ) : null}
        <Link href={mapHref} className="tap-btn tap-btn-secondary tap-btn-md">
          {s.backToMap}
        </Link>
        <Link
          href={dashboardHref}
          className="tap-btn tap-btn-primary tap-btn-md"
        >
          {s.continueAdventure}
        </Link>
      </div>
    </div>
  );
}
