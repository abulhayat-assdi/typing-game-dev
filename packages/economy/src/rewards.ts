/**
 * Reward mathematics (M5). Pure award computation from a VALIDATED result +
 * contextual flags. The SQL progression function is the sole writer; this
 * module is the auditable spec of record (mirrored rules, unit-tested) and
 * powers the offline memory store used by route tests.
 */
export interface RewardProfile {
  id: string;
  xpCompletion: number;
  coinCompletion: number;
  xpFirstCompletion: number;
  xpPersonalBest: number;
  coinPersonalBest: number;
  xpAccuracyMilestone: number;
  accuracyMilestoneThreshold: number;
  xpSpeedMilestone: number;
  speedMilestoneWpm: number;
}

/** Mirrors the seeded `default` row (0008 migration). */
export const DEFAULT_REWARD_PROFILE: RewardProfile = {
  id: "default",
  xpCompletion: 10,
  coinCompletion: 2,
  xpFirstCompletion: 20,
  xpPersonalBest: 15,
  coinPersonalBest: 5,
  xpAccuracyMilestone: 10,
  accuracyMilestoneThreshold: 95,
  xpSpeedMilestone: 10,
  speedMilestoneWpm: 30,
};

export interface ValidatedResultInput {
  accuracy: number;
  effectiveWpm: number;
  /** First validated completion of this game by this user. */
  isFirstCompletion: boolean;
  /** New personal best score for this game. */
  isPersonalBest: boolean;
}

export interface AwardBreakdown {
  xp: number;
  coins: number;
  parts: { base: number; first: number; personalBest: number; accuracy: number; speed: number };
}

export function computeXpAward(
  result: ValidatedResultInput,
  profile: RewardProfile = DEFAULT_REWARD_PROFILE,
): { xp: number; parts: AwardBreakdown["parts"] } {
  const parts = {
    base: profile.xpCompletion,
    first: result.isFirstCompletion ? profile.xpFirstCompletion : 0,
    personalBest: result.isPersonalBest ? profile.xpPersonalBest : 0,
    accuracy: result.accuracy >= profile.accuracyMilestoneThreshold ? profile.xpAccuracyMilestone : 0,
    speed: result.effectiveWpm >= profile.speedMilestoneWpm ? profile.xpSpeedMilestone : 0,
  };
  const xp = parts.base + parts.first + parts.personalBest + parts.accuracy + parts.speed;
  return { xp: Math.max(0, Math.floor(xp)), parts };
}

export function computeCoinAward(
  result: ValidatedResultInput,
  profile: RewardProfile = DEFAULT_REWARD_PROFILE,
): number {
  const coins =
    profile.coinCompletion + (result.isPersonalBest ? profile.coinPersonalBest : 0);
  return Math.max(0, Math.floor(coins));
}
