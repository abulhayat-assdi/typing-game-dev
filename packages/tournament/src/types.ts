/**
 * @tap/tournament - tournament domain (M14). Pure TypeScript, no UI/DB imports.
 *
 * A tournament is an orchestration layer over existing competitive systems
 * (clan wars / competitions). It never scores typing itself: matches
 * reference an existing war/competition context, results flow back, and the
 * bracket advances. Mirrors the 0029/0030 SQL semantics; the database
 * re-validates everything on write.
 */

export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "swiss";

export type TournamentParticipantType = "clan" | "student";

export type TournamentStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "seeded"
  | "live"
  | "processing"
  | "finalized"
  | "cancelled";

export type TournamentMatchStatus =
  | "pending"
  | "ready"
  | "live"
  | "processing"
  | "finalized"
  | "bye"
  | "cancelled";

export type SeedingMethod = "manual" | "season_ranking" | "random";

export type MatchSourceType = "clan_war" | "competition" | "bye" | "manual";

export interface TournamentDefinitionInput {
  slug: string;
  name: string;
  format: TournamentFormat;
  participantType: TournamentParticipantType;
  registrationStart?: string | null;
  registrationEnd?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  participantCap?: number | null;
  seasonId?: string | null;
}

export interface SeedEntry {
  participantId: string;
  seed: number;
  source: string;
}

export interface BracketParticipant {
  participantId: string;
  seed: number;
}

/** One generated first-round slot pairing (null side = bye). */
export interface BracketSlot {
  round: number;
  slot: number;
  a: BracketParticipant | null;
  b: BracketParticipant | null;
  byeTo: BracketParticipant | null;
}

export interface MatchScoreInput {
  scoreA: number;
  scoreB: number;
  accuracyA?: number;
  accuracyB?: number;
  bestA?: number;
  bestB?: number;
  participationA?: number;
  participationB?: number;
  earliestAMs?: number | null;
  earliestBMs?: number | null;
}

export type TieBreakKey =
  | "score"
  | "accuracy"
  | "best"
  | "participation"
  | "earliest";

export const DEFAULT_TIE_BREAKERS: TieBreakKey[] = [
  "score",
  "accuracy",
  "best",
  "participation",
  "earliest",
];
