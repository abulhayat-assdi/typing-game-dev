/** @tap/competition — reusable competition domain (M8). No UI imports. */
export {
  validateCompetitionDefinition,
  type CompetitionDefinition,
} from "./definition";
export {
  acceptsAttempts,
  acceptsRegistration,
  allowedNextStatuses,
  canTransitionStatus,
  isTerminalStatus,
} from "./lifecycle";
export {
  evaluateEligibility,
  type EligibilityPlayer,
  type EligibilityVerdict,
} from "./eligibility";
export {
  DEFAULT_TIE_BREAKERS,
  aggregateBatch,
  competitionValue,
  rankEntries,
  selectRepresentative,
  type RankedEntry,
  type ScoredAttempt,
  type Representative,
} from "./scoring";
export type {
  AggregateStrategy,
  AttemptPolicy,
  CompetitionStatus,
  CompetitionType,
  EligibilityRule,
  RewardPolicy,
  ScoringConfig,
  TieBreakKey,
  Visibility,
} from "./types";
