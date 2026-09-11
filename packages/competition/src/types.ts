/**
 * Competition domain types (M8). One model stretches from SOLO drills to
 * future clan wars: type/scope/strategy fields are data, never new tables.
 * Future types (CLAN, CLAN_WAR, TOURNAMENT, RELAY, SEASONAL) are accepted by
 * the type system today; their mechanics land in later milestones.
 */

export type CompetitionType =
  | "SOLO"
  | "BATCH"
  | "TIMED"
  | "SCORE_ATTACK"
  | "ACCURACY"
  | "SPEED"
  | "ENDURANCE"
  | "MULTI_ROUND"
  | "CLAN"
  | "CLAN_WAR"
  | "TOURNAMENT"
  | "RELAY"
  | "SEASONAL";

export type CompetitionStatus =
  | "draft"
  | "scheduled"
  | "registration_open"
  | "registration_closed"
  | "live"
  | "ended"
  | "processing"
  | "finalized"
  | "cancelled"
  | "paused";

export type AttemptPolicy =
  | "BEST_SCORE"
  | "BEST_ACCURACY"
  | "BEST_WPM"
  | "LATEST_VALID"
  | "AVERAGE_TOP_3";

export type AggregateStrategy =
  | "SUM"
  | "AVERAGE"
  | "TOP_N"
  | "AVERAGE_TOP_N"
  | "BEST_PLAYER"
  | "PARTICIPATION_WEIGHTED";

export type Visibility = "public" | "organization" | "batch";

export interface EligibilityRule {
  batches?: string[];
  courses?: string[];
  skillBands?: string[];
  minLevel?: number;
  minAccuracy?: number;
  minWpm?: number;
}

export interface ScoringConfig {
  metric: "wpm" | "accuracy" | "score" | "hybrid";
  wpmWeight?: number;
  accuracyWeight?: number;
  wpmCap?: number;
}

export type TieBreakKey =
  | "score"
  | "accuracy"
  | "wpm"
  | "errors"
  | "earliest";

export interface RewardPolicy {
  xp?: Record<string, number>;
  coins?: Record<string, number>;
  badgeFirst?: string;
}

export interface CompetitionDefinition {
  id: string;
  slug: string;
  title: { en: string; bn?: string };
  description: { en: string; bn?: string };
  type: CompetitionType;
  visibility: Visibility;
  organizerId: string;
  scopeCourses: string[];
  scopeBatches: string[];
  skillBands: string[];
  gameSlugs: string[];
  gameVersions?: Record<string, number>;
  startsAt: string;
  endsAt: string;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  attemptLimit: number;
  scoring: ScoringConfig;
  tieBreakers: TieBreakKey[];
  attemptPolicy: AttemptPolicy;
  aggregateStrategy?: AggregateStrategy;
  aggregateN?: number;
  rewardPolicy: RewardPolicy;
  rules: string;
  status: CompetitionStatus;
  version: number;
}
