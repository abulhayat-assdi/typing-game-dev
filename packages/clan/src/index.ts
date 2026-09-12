// M10 clan foundation. Full implementation replaces this placeholder.
export {
  DEFAULT_CONTRIBUTION_RULE,
  contributionForScore,
  parseContributionRule,
} from "./contribution";
export {
  DEFAULT_HELP_LIMITS,
  checkContribution,
  validateHelpRequest,
  type ContributionCheck,
  type HelpRequestInput,
} from "./help";
export {
  rankClans,
  rankRoster,
  windowStartMs,
  type ContributionEvent,
} from "./aggregation";
export type {
  BoardWindow,
  ClanBoardEntry,
  ClanHelpStatus,
  ClanMemberRole,
  ClanMemberStatus,
  ClanRosterRow,
  ClanStatus,
  ContributionRule,
  HelpLimits,
} from "./types";
