/**
 * @tap/adaptive - adaptive learning domain (M15). Pure TypeScript, no
 * UI/DB imports. Consumes validated attempt evidence only (never scores
 * typing, never mints XP/coins, never creates missions). The database
 * re-validates everything on write; the SQL refresh mirrors this logic.
 *
 * Algorithm versioning: ALGO_VERSION tags every recommendation row so
 * future tuning stays comparable. Thresholds live in ALGO_CONFIG with
 * documented rationale — no magic numbers.
 */

export type KeyState =
  | "mastered"
  | "strong"
  | "normal"
  | "weak"
  | "critical"
  | "insufficient";

export type FingerName =
  | "left_pinky"
  | "left_ring"
  | "left_middle"
  | "left_index"
  | "left_thumb"
  | "right_thumb"
  | "right_index"
  | "right_middle"
  | "right_ring"
  | "right_pinky";

export type TrendDirection =
  | "improving"
  | "stable"
  | "declining"
  | "insufficient";

export type ReasonCode =
  | "WEAK_KEY"
  | "WEAK_FINGER"
  | "LOW_ACCURACY"
  | "LOW_WPM"
  | "DECLINING_TREND"
  | "UNLOCK_PREPARATION"
  | "DAILY_MISSION"
  | "WEEKLY_CHALLENGE"
  | "PERSONAL_BEST_OPPORTUNITY";

export type PracticeBand = "beginner" | "intermediate" | "expert";

export interface KeyStat {
  key: string;
  exposures: number;
  errors: number;
}

export interface KeyAlignment {
  keys: KeyStat[];
  /** Substitution pairs observed position-wise (expected → typed). */
  pairs: { expected: string; actual: string; count: number }[];
}

export interface WeaknessInput {
  errorRate: number;
  evidenceCount: number;
  exposures: number;
  relevance: number;
}

export interface WeaknessScore {
  score: number;
  confidence: number;
  evidenceCount: number;
}

export interface TrendSample {
  value: number;
  atMs: number;
}

export interface TrendResult {
  direction: TrendDirection;
  recent: number | null;
  baseline: number | null;
  evidence: number;
}

export interface RecommendationCandidate {
  gameSlug: string;
  mechanic: string;
  promptKind: string;
  active: boolean;
  unlocked: boolean;
  difficultyFit: number;
  missionId: string | null;
  missionKind: string | null;
}

export interface ScoredRecommendation {
  gameSlug: string;
  difficulty: string;
  missionId: string | null;
  reason: ReasonCode;
  message: string;
  expectedBenefit: string;
  confidence: number;
  priority: number;
  targets: string[];
}

export interface DifficultyTarget {
  targetAccuracy: number;
  targetWpm: number;
}

export interface DifficultyDecision {
  band: PracticeBand;
  action: "increase" | "maintain" | "decrease";
  promptMinLen: number;
  promptMaxLen: number;
  targetWpm: number;
  targetAccuracy: number;
}

/**
 * Tunable thresholds, versioned with the algorithm. Rationale:
 * - key evidence floors stop single-attempt diagnoses;
 * - trend windows ignore one anomalous attempt;
 * - weights sum to 1 so priority stays comparable across versions.
 */
export const ALGO_VERSION = "adaptive-v1" as const;

export const ALGO_CONFIG = {
  version: ALGO_VERSION,
  /** Exposures before a key earns a real state (else "insufficient"). */
  minKeyExposures: 20,
  /** Key accuracy cutoffs, high to low. */
  keyCutoffs: { mastered: 98, strong: 95, normal: 90, weak: 80 },
  /** Attempts before a confusion pair becomes a pattern. */
  minPairCount: 3,
  /** Recent-vs-baseline windows (attempt counts). */
  trendRecentN: 10,
  trendBaselineN: 40,
  /** Minimum samples per side before a trend is claimed. */
  minTrendEvidence: 5,
  /** Accuracy/WPM deltas that count as real movement. */
  trendEpsilonAccuracy: 1.5,
  trendEpsilonWpm: 2,
  /** Weakness factors (see skills.ts for the formula). */
  weaknessRecurrenceAt: 8,
  weaknessConfidenceAt: 50,
  /** Recommendation weights (sum = 1). */
  weights: {
    skillGap: 0.3,
    confidence: 0.15,
    trendUrgency: 0.15,
    relevance: 0.1,
    difficultyFit: 0.1,
    freshness: 0.1,
    missionBonus: 0.05,
    unlockReady: 0.05,
  },
  /** Diversity: max shows of one game inside the fatigue window. */
  maxGameRepeats: 2,
  fatigueWindowShows: 7,
  /** Difficulty gates. */
  promoteAccuracyDelta: 2,
  demoteAccuracyFloor: 80,
  formWindowN: 3,
} as const;
