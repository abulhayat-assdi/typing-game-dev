/**
 * @tap/rewards-ads - rewarded-ad domain (M17). Pure TypeScript, no
 * UI/DB imports. Provider-abstracted: the internal reward system never
 * changes when providers do. Google Offerwall manages its own ad/reward
 * interaction (no custom server callback exists), so Google completions
 * are explicitly unverifiable for custom item grants — those flows stay
 * fail-closed. The mock provider is development-only.
 */

export type RewardProviderName = "google_offerwall" | "mock";

export type SessionStatus =
  | "offered"
  | "opted_in"
  | "started"
  | "completed"
  | "verified"
  | "rewarded"
  | "failed"
  | "expired"
  | "cancelled";

export type RewardKind = "item" | "coins" | "streak_recovery";

export type AnalyticsEvent =
  | "opportunity_shown"
  | "user_opted_in"
  | "ad_started"
  | "ad_completed"
  | "verification_success"
  | "verification_failure"
  | "reward_granted"
  | "reward_denied"
  | "reward_duplicate"
  | "user_declined"
  | "no_fill"
  | "provider_error";

export interface RewardDefinition {
  slug: string;
  kind: RewardKind;
  /** Item slug (kind=item), recovery days (kind=streak_recovery). */
  ref: string;
  amount: number;
  enabled: boolean;
}

export interface RecoveryPolicy {
  maxRecoverableDays: number;
  adsPerDayRecovered: number;
  recoveryWindowDays: number;
  cooldownHours: number;
  maxUses: number;
}

export interface RewardPolicyConfig {
  enabled: boolean;
  provider: RewardProviderName;
  mockAllowed: boolean;
  dailyLimit: number;
  cooldownMinutes: number;
  maxRewardsPerDay: number;
  allowCoinRewards: boolean;
  recovery: RecoveryPolicy;
}

export const DEFAULT_POLICY: RewardPolicyConfig = {
  enabled: false,
  provider: "mock",
  mockAllowed: true,
  dailyLimit: 5,
  cooldownMinutes: 60,
  maxRewardsPerDay: 5,
  // Coins stay disabled until a compliant indirect-reward reading is
  // explicitly approved; items are the default reward surface.
  allowCoinRewards: false,
  recovery: {
    maxRecoverableDays: 2,
    adsPerDayRecovered: 1,
    recoveryWindowDays: 3,
    cooldownHours: 24,
    maxUses: 4,
  },
};

/** Allow-listed reward catalog (admins enable/disable, never invent). */
export const REWARD_CATALOG: RewardDefinition[] = [
  { slug: "retry-token", kind: "item", ref: "retry-token", amount: 1, enabled: true },
  { slug: "streak-recovery-1d", kind: "streak_recovery", ref: "1", amount: 1, enabled: true },
  { slug: "welcome-frame", kind: "item", ref: "welcome-frame", amount: 1, enabled: false },
];

const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  offered: ["opted_in", "cancelled", "expired"],
  opted_in: ["started", "cancelled", "expired"],
  started: ["completed", "failed", "expired", "cancelled"],
  completed: ["verified", "failed", "expired"],
  verified: ["rewarded", "failed"],
  rewarded: [],
  failed: [],
  expired: [],
  cancelled: [],
};

export function canTransitionSession(
  from: string,
  to: string,
): boolean {
  const next: readonly string[] | undefined =
    (TRANSITIONS as Record<string, readonly string[]>)[from];
  if (next === undefined) return false;
  return next.includes(to);
}

/**
 * Deterministic grant key. Same (provider, reference, user) ⇒ same
 * key: duplicate callbacks/retries collapse to one grant.
 */
export function grantKey(
  provider: RewardProviderName,
  providerReference: string,
  userId: string,
): string {
  return `rewarded-ad:${provider}:${providerReference}:${userId}:v1`;
}

export function isTerminalStatus(status: SessionStatus): boolean {
  return (
    status === "rewarded" ||
    status === "failed" ||
    status === "expired" ||
    status === "cancelled"
  );
}
