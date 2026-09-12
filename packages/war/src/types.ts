/**
 * @tap/war - clan war domain (M11). Pure TypeScript, no UI/DB imports.
 * Mirrors fn_war_can_transition / fn_finalize_war semantics in SQL.
 */

export type WarStatus =
  | "draft"
  | "challenge_sent"
  | "pending_response"
  | "accepted"
  | "declined"
  | "preparation"
  | "live"
  | "processing"
  | "finalized"
  | "cancelled"
  | "expired";

export type WarInviteStatus = "pending" | "accepted" | "declined" | "expired";

export type WarScope = "same_course" | "cross_course" | "same_org" | "cross_org";

export type ScoringMode = "sum" | "top_n" | "average";
export type PlayerPolicy = "best_score" | "best_wpm" | "best_accuracy" | "sum";

export interface WarScoringProfile {
  mode: ScoringMode;
  topN?: number;
  playerPolicy: PlayerPolicy;
}

export interface WarRules {
  attemptsPerPlayer: number;
  prepHours: number;
  battleHours: number;
  tieBreakers: string[];
}

export interface WarRewardPolicy {
  winnerXp: number;
  winnerCoins: number;
  participantXp: number;
  participantCoins: number;
}

export interface WarContribution {
  userId: string;
  clanId: string;
  score: number;
  attempts: number;
  bestWpm: number | null;
  bestAccuracy: number | null;
  submittedAtMs: number | null;
}

export interface ClanWarTotal {
  clanId: string;
  total: number;
  avgAccuracy: number;
  best: number;
  participants: number;
  earliestMs: number | null;
  rank: number;
  isWinner: boolean;
}
