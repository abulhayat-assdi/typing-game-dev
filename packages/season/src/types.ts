/**
 * @tap/season - season domain (M13). Pure TypeScript, no UI/DB imports.
 * Mirrors the SQL point/leaderboard/tier semantics; the database
 * re-validates everything on write.
 */

export type SeasonStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "processing"
  | "finalized"
  | "cancelled";

export type ParticipantType = "student" | "clan";

export type SourceType =
  | "COMPETITION"
  | "CLAN_WAR"
  | "CLAN_BOSS"
  | "MISSION"
  | "ACHIEVEMENT";

export interface TierDefinition {
  tier: string;
  minPoints: number;
  minRank?: number;
}

export interface PointEvent {
  source: SourceType;
  participantType: ParticipantType;
  participantId: string;
  points: number;
  occurredAtMs: number;
}

export interface RankedParticipant {
  participantId: string;
  displayName: string;
  points: number;
  rank: number;
  tier: string | null;
  firstAtMs: number;
}
