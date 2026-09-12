/**
 * @tap/clan - clan domain (M10). Pure TypeScript, no UI/DB imports.
 * Mirrors the SQL semantics in 0019-0021; the database re-validates
 * everything on write.
 */

export type ClanStatus = "active" | "inactive";
export type ClanMemberRole = "leader" | "co_leader" | "member";
export type ClanMemberStatus = "active" | "inactive" | "removed";
export type ClanHelpStatus =
  | "open"
  | "partially_fulfilled"
  | "fulfilled"
  | "expired"
  | "cancelled";

export interface ContributionRule {
  /** Attempt score points per contribution point (default 10). */
  pointsPerScore: number;
  /** Floor per validated attempt (default 1). */
  minPoints?: number;
}

export interface HelpLimits {
  /** Max XP granted per request. */
  requestMax: number;
  /** Default / min / max time-to-live in hours. */
  ttlHoursDefault: number;
  ttlHoursMin: number;
  ttlHoursMax: number;
  /** Max coins one supporter may spend per day. */
  supporterDailySpend: number;
  /** Max XP one requester may receive per day. */
  requesterDailyCap: number;
}

export type BoardWindow = "all" | "weekly" | "daily";

export interface ClanBoardEntry {
  clanId: string;
  name: string;
  memberCount: number;
  totalPoints: number;
  rank: number;
}

export interface ClanRosterRow {
  userId: string;
  displayName: string;
  rollNumber: string;
  role: ClanMemberRole;
  level: number;
  xpTotal: number;
  contribution: number;
  isMe: boolean;
}
