/**
 * Deterministic score derivation (M4). Score is a pure function of raw
 * metrics + profile — same inputs, same score, every runtime. Rewards
 * (XP/coins) are computed elsewhere, much later, from stored scores.
 */
import type { RawMetrics } from "./metrics";
import { getScoringProfile, type ScoringProfile } from "./profiles";

export interface ScoreResult {
  score: number;
  profileId: string;
  breakdown: {
    wpmPart: number;
    accuracyPart: number;
    completionPart: number;
    flawlessPart: number;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeScore(
  metrics: RawMetrics,
  profileId: string,
): ScoreResult {
  const profile: ScoringProfile = getScoringProfile(profileId);
  const wpmPart = metrics.effectiveWpm * profile.wpmWeight;
  const accuracyPart = metrics.accuracy * profile.accuracyWeight;
  const completionPart = metrics.completion * profile.completionBonus;
  const flawlessPart =
    metrics.incorrectCharacters === 0 && metrics.totalCharacters > 0
      ? profile.flawlessBonus
      : 0;
  const score =
    (wpmPart + accuracyPart + completionPart + flawlessPart) *
    profile.multiplier;
  return {
    score: round2(Math.max(0, score)),
    profileId: profile.id,
    breakdown: {
      wpmPart: round2(wpmPart),
      accuracyPart: round2(accuracyPart),
      completionPart: round2(completionPart),
      flawlessPart: round2(flawlessPart),
    },
  };
}
