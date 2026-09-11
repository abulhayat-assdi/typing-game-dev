/**
 * Competition scoring + ranking (M8). Consumes VALIDATED result metrics only.
 * Deterministic: identical inputs ⇒ identical order, with a documented
 * default tie-break chain ending in entry-id order (total order guaranteed).
 */
import type {
  AggregateStrategy,
  AttemptPolicy,
  ScoringConfig,
  TieBreakKey,
} from "./types";

export interface ScoredAttempt {
  attemptId: string;
  entryId: string;
  userId: string;
  batchId: string | null;
  score: number;
  accuracy: number;
  wpm: number;
  errors: number;
  submittedAt: string;
}

export const DEFAULT_TIE_BREAKERS: TieBreakKey[] = [
  "score",
  "accuracy",
  "wpm",
  "errors",
  "earliest",
];

export function competitionValue(
  attempt: Pick<ScoredAttempt, "score" | "accuracy" | "wpm">,
  config: ScoringConfig,
): number {
  switch (config.metric) {
    case "wpm":
      return attempt.wpm;
    case "accuracy":
      return attempt.accuracy;
    case "score":
      return attempt.score;
    case "hybrid": {
      const wpmCap = config.wpmCap && config.wpmCap > 0 ? config.wpmCap : 100;
      const wpmPart = Math.min(1, attempt.wpm / wpmCap);
      const accPart = Math.min(1, Math.max(0, attempt.accuracy) / 100);
      const wpmWeight = config.wpmWeight ?? 0.5;
      const accuracyWeight = config.accuracyWeight ?? 0.5;
      return wpmPart * wpmWeight + accPart * accuracyWeight;
    }
  }
}

export interface Representative {
  attemptId: string;
  entryId: string;
  userId: string;
  batchId: string | null;
  /** Policy value (for AVERAGE_TOP_3: mean of top three, not one attempt). */
  value: number;
  accuracy: number;
  wpm: number;
  errors: number;
  submittedAt: string;
}

/**
 * Reduce one entry's attempts to a single representative. For AVERAGE_TOP_3
 * the value is the mean of the top three by competition value; the anchor
 * attempt (best of the three) supplies audit fields and tie-break metrics.
 */
export function selectRepresentative(
  attempts: ScoredAttempt[],
  policy: AttemptPolicy,
  config: ScoringConfig,
): Representative | null {
  const valid = attempts.filter((a) => a.submittedAt);
  if (valid.length === 0) return null;
  const anchor = (list: ScoredAttempt[]): ScoredAttempt =>
    [...list].sort(
      (a, b) => competitionValue(b, config) - competitionValue(a, config),
    )[0] as ScoredAttempt;
  const single = (fn: (a: ScoredAttempt) => number): Representative => {
    const best = valid.reduce((x, y) => (fn(y) > fn(x) ? y : x));
    return { ...best, value: competitionValue(best, config) };
  };
  switch (policy) {
    case "BEST_SCORE":
      return single((a) => a.score);
    case "BEST_ACCURACY":
      return single((a) => a.accuracy);
    case "BEST_WPM":
      return single((a) => a.wpm);
    case "LATEST_VALID": {
      const latest = valid.reduce((a, b) => (a.submittedAt > b.submittedAt ? a : b));
      return { ...latest, value: competitionValue(latest, config) };
    }
    case "AVERAGE_TOP_3": {
      const top = [...valid]
        .sort((a, b) => competitionValue(b, config) - competitionValue(a, config))
        .slice(0, 3);
      const best = anchor(top);
      const mean = top.reduce((s, a) => s + competitionValue(a, config), 0) / top.length;
      return { ...best, value: mean };
    }
  }
}

export interface RankedEntry {
  entryId: string;
  userId: string;
  batchId: string | null;
  value: number;
  accuracy: number;
  wpm: number;
  errors: number;
  submittedAt: string;
  rank: number;
}

function compareTie(
  a: RankedEntry,
  b: RankedEntry,
  tieBreakers: TieBreakKey[],
): number {
  for (const key of tieBreakers) {
    let diff = 0;
    switch (key) {
      case "score":
        diff = b.value - a.value;
        break;
      case "accuracy":
        diff = b.accuracy - a.accuracy;
        break;
      case "wpm":
        diff = b.wpm - a.wpm;
        break;
      case "errors":
        diff = a.errors - b.errors;
        break;
      case "earliest":
        diff = a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0;
        break;
    }
    if (diff !== 0) return diff;
  }
  // Total order: entry id decides (stable, reproducible).
  return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
}

/** Deterministic ranking; rank 1..N with no shared positions. */
export function rankEntries(
  entries: Omit<RankedEntry, "rank">[],
  tieBreakers: TieBreakKey[] = DEFAULT_TIE_BREAKERS,
): RankedEntry[] {
  const sorted = [...entries].sort((a, b) =>
    compareTie(
      { ...a, rank: 0 },
      { ...b, rank: 0 },
      tieBreakers.length > 0 ? tieBreakers : DEFAULT_TIE_BREAKERS,
    ),
  );
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

/** Batch/team aggregates over participant final values (Phase-3 ready). */
export function aggregateBatch(
  values: number[],
  strategy: AggregateStrategy,
  n = 3,
): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  switch (strategy) {
    case "SUM":
      return sorted.reduce((a, b) => a + b, 0);
    case "AVERAGE":
      return sorted.reduce((a, b) => a + b, 0) / sorted.length;
    case "TOP_N":
      return sorted.slice(0, Math.max(1, n)).reduce((a, b) => a + b, 0);
    case "AVERAGE_TOP_N": {
      const top = sorted.slice(0, Math.max(1, n));
      return top.reduce((a, b) => a + b, 0) / top.length;
    }
    case "BEST_PLAYER":
      return sorted[0] as number;
    case "PARTICIPATION_WEIGHTED":
      return (
        (sorted.reduce((a, b) => a + b, 0) / sorted.length) *
        Math.log10(10 + sorted.length)
      );
  }
}
