/**
 * Scoring profiles as DATA (M4). New games pick a profile id — no engine
 * rewrite. Mirrors the scoring_profiles table (0006 migration + seed).
 */
export interface ScoringProfile {
  id: string;
  /** Weight of effective WPM in the score. */
  wpmWeight: number;
  /** Weight of accuracy (0..100 scale) in the score. */
  accuracyWeight: number;
  /** Bonus per completion percent point. */
  completionBonus: number;
  /** Flat bonus for zero-error runs. */
  flawlessBonus: number;
  /** Global multiplier (events, bosses). */
  multiplier: number;
}

export const SCORING_PROFILES: Record<string, ScoringProfile> = {
  standard: {
    id: "standard",
    wpmWeight: 1,
    accuracyWeight: 1,
    completionBonus: 0.5,
    flawlessBonus: 25,
    multiplier: 1,
  },
  speed: {
    id: "speed",
    wpmWeight: 2,
    accuracyWeight: 0.5,
    completionBonus: 0.25,
    flawlessBonus: 10,
    multiplier: 1,
  },
  accuracy: {
    id: "accuracy",
    wpmWeight: 0.5,
    accuracyWeight: 2,
    completionBonus: 0.5,
    flawlessBonus: 50,
    multiplier: 1,
  },
  survival: {
    id: "survival",
    wpmWeight: 1,
    accuracyWeight: 1.5,
    completionBonus: 1,
    flawlessBonus: 40,
    multiplier: 1,
  },
  boss: {
    id: "boss",
    wpmWeight: 1.5,
    accuracyWeight: 1.5,
    completionBonus: 1,
    flawlessBonus: 100,
    multiplier: 2,
  },
  "clan-aggregate": {
    id: "clan-aggregate",
    wpmWeight: 1,
    accuracyWeight: 1,
    completionBonus: 0.5,
    flawlessBonus: 0,
    multiplier: 1,
  },
};

export function getScoringProfile(id: string): ScoringProfile {
  const profile = SCORING_PROFILES[id];
  if (!profile) throw new Error(`Unknown scoring profile "${id}"`);
  return profile;
}

export function listScoringProfiles(): ScoringProfile[] {
  return Object.values(SCORING_PROFILES);
}
