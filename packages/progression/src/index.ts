/** @tap/progression — streaks, unlocks, badges, achievements, records (M5). */
export {
  achievementReached,
  badgeEarned,
  type AchievementDef,
  type AchievementMetric,
  type AttemptBadgeStats,
  type BadgeCriterion,
  type LifetimeBadgeStats,
  type LifetimeStats,
} from "./milestones";
export {
  isRecordBroken,
  type RecordMetric,
} from "./records";
export {
  nextStreak,
  type StreakOutcome,
  type StreakState,
} from "./streak";
export {
  activityDate,
  daysBetween,
  isValidTimezone,
  normalizeTimezone,
  DEFAULT_TIMEZONE,
} from "./timezone";
export {
  evaluateUnlock,
  type UnlockStats,
  type UnlockVerdict,
} from "./unlocks";
