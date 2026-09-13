/** @tap/rewards-ads - rewarded ads domain (M17). No UI imports. */
export { createProvider, MockRewardProvider, OfferwallProvider, mockTokenMessage } from "./provider";
export type { ProviderCompletion, RewardProvider, VerificationResult } from "./provider";
export { offerAllowed, recoveryAllowed } from "./policy";
export type { LimitCounts, RecoveryState } from "./policy";
export {
  DEFAULT_POLICY,
  REWARD_CATALOG,
  canTransitionSession,
  grantKey,
  isTerminalStatus,
} from "./types";
export type {
  AnalyticsEvent,
  RecoveryPolicy,
  RewardDefinition,
  RewardKind,
  RewardPolicyConfig,
  RewardProviderName,
  SessionStatus,
} from "./types";
