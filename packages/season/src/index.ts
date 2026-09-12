/** @tap/season - season domain (M13). No UI imports. */
export { canTransitionSeasonStatus, validateSeasonDefinition } from "./definition";
export type { SeasonDefinitionInput } from "./definition";
export { aggregatePoints, rankBoard, tierFor } from "./scoring";
export type {
  ParticipantType,
  PointEvent,
  RankedParticipant,
  SeasonStatus,
  SourceType,
  TierDefinition,
} from "./types";
