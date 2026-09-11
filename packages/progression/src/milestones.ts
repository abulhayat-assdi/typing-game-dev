/**
 * Badge + achievement criteria matchers (M5). Machine-evaluable rule shapes
 * mirroring the badges/achievements table criteria JSON. The SQL function is
 * the sole awarder; these pure matchers drive tests and future explanations.
 */

export type BadgeCriterion =
  | { kind: "first_completion" }
  | { kind: "accuracy_min"; min: number }
  | { kind: "wpm_min"; min: number }
  | { kind: "streak_days"; min: number }
  | { kind: "words_total"; min: number }
  | { kind: "games_completed"; min: number }
  | { kind: "zero_error_runs"; min: number };

export interface AttemptBadgeStats {
  accuracy: number;
  effectiveWpm: number;
  incorrectChars: number;
  isFirstCompletion: boolean;
}

export interface LifetimeBadgeStats {
  streakDays: number;
  totalWords: number;
  gamesCompleted: number;
  zeroErrorRuns: number;
}

export function badgeEarned(
  criterion: BadgeCriterion,
  attempt: AttemptBadgeStats,
  lifetime: LifetimeBadgeStats,
): boolean {
  switch (criterion.kind) {
    case "first_completion":
      return attempt.isFirstCompletion;
    case "accuracy_min":
      return attempt.accuracy >= criterion.min;
    case "wpm_min":
      return attempt.effectiveWpm >= criterion.min;
    case "streak_days":
      return lifetime.streakDays >= criterion.min;
    case "words_total":
      return lifetime.totalWords >= criterion.min;
    case "games_completed":
      return lifetime.gamesCompleted >= criterion.min;
    case "zero_error_runs":
      return lifetime.zeroErrorRuns >= criterion.min;
    default:
      return false;
  }
}

export type AchievementMetric =
  | "total_chars"
  | "total_words"
  | "attempts"
  | "best_wpm"
  | "best_accuracy"
  | "streak_best";

export interface AchievementDef {
  slug: string;
  metric: AchievementMetric;
  threshold: number;
}

export interface LifetimeStats {
  totalChars: number;
  totalWords: number;
  attempts: number;
  bestWpm: number;
  bestAccuracy: number;
  streakBest: number;
}

export function achievementReached(def: AchievementDef, stats: LifetimeStats): boolean {
  switch (def.metric) {
    case "total_chars":
      return stats.totalChars >= def.threshold;
    case "total_words":
      return stats.totalWords >= def.threshold;
    case "attempts":
      return stats.attempts >= def.threshold;
    case "best_wpm":
      return stats.bestWpm >= def.threshold;
    case "best_accuracy":
      return stats.bestAccuracy >= def.threshold;
    case "streak_best":
      return stats.streakBest >= def.threshold;
    default:
      return false;
  }
}
