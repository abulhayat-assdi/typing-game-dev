/** @tap/war - clan war domain (M11). No UI imports. */
export {
  acceptsSubmissions,
  allowedNextStatuses,
  canTransitionStatus,
  isTerminalStatus,
} from "./lifecycle";
export { clanTotal, playerScore, rankClans } from "./scoring";
export type {
  PlayerPolicy,
  ScoringMode,
  WarContribution,
  ClanWarTotal,
  WarInviteStatus,
  WarRewardPolicy,
  WarRules,
  WarScope,
  WarScoringProfile,
  WarStatus,
} from "./types";
