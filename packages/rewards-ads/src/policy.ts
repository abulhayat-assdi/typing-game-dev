/**
 * Policy evaluation helpers (M17). Pure checks over counts the SQL
 * layer supplies; limits themselves are enforced server-side.
 */
import type { RecoveryPolicy, RewardPolicyConfig } from "./types";

export interface LimitCounts {
  sessionsToday: number;
  rewardsToday: number;
  minutesSinceLastSession: number | null;
}

export function offerAllowed(
  policy: RewardPolicyConfig,
  counts: LimitCounts,
): { ok: boolean; reason: string } {
  if (!policy.enabled) return { ok: false, reason: "DISABLED" };
  if (counts.sessionsToday >= policy.dailyLimit) {
    return { ok: false, reason: "DAILY_LIMIT" };
  }
  if (counts.rewardsToday >= policy.maxRewardsPerDay) {
    return { ok: false, reason: "REWARD_CAP" };
  }
  if (
    counts.minutesSinceLastSession !== null &&
    counts.minutesSinceLastSession < policy.cooldownMinutes
  ) {
    return { ok: false, reason: "COOLDOWN" };
  }
  return { ok: true, reason: "OK" };
}

export interface RecoveryState {
  lapsedDays: number;
  recoveriesUsed: number;
  hoursSinceLastRecovery: number | null;
  alreadyRecoveredDates: number;
}

export function recoveryAllowed(
  policy: RecoveryPolicy,
  state: RecoveryState,
): { ok: boolean; reason: string; days: number } {
  if (state.lapsedDays < 1) return { ok: false, reason: "NO_LAPSE", days: 0 };
  const days = Math.min(state.lapsedDays, policy.maxRecoverableDays);
  if (state.recoveriesUsed >= policy.maxUses) {
    return { ok: false, reason: "RECOVERY_CAP", days: 0 };
  }
  if (
    state.hoursSinceLastRecovery !== null &&
    state.hoursSinceLastRecovery < policy.cooldownHours
  ) {
    return { ok: false, reason: "RECOVERY_COOLDOWN", days: 0 };
  }
  if (state.alreadyRecoveredDates >= days) {
    return { ok: false, reason: "ALREADY_RECOVERED", days: 0 };
  }
  return { ok: true, reason: "OK", days };
}
