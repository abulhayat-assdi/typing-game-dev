/** @tap/tournament - tournament domain (M14). No UI imports. */
export { canTransitionMatchStatus, canTransitionTournamentStatus, isImplementedFormat, isSupportedParticipantType, validateTournamentDefinition } from "./definition";
export { advancementTarget, decideWinner, placements } from "./match";
export { generateFirstRound, nextPowerOfTwo, planBracket, planSingleElimination, roundCount, roundName, seedPositions } from "./bracket";
export type { BracketPlan } from "./bracket";
export { mulberry32, rankSnapshotRows, seedFromRanking, seedManual, seedRandom, shuffleWithSeed, validateSeedEntries } from "./seeding";
export type { RankedSnapshotRow } from "./seeding";
export { DEFAULT_TIE_BREAKERS } from "./types";
export type { BracketParticipant, BracketSlot, MatchScoreInput, MatchSourceType, SeedingMethod, TieBreakKey, TournamentDefinitionInput, TournamentFormat, TournamentMatchStatus, TournamentParticipantType, TournamentStatus } from "./types";
