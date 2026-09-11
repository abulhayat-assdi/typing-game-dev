/** @tap/scoring — deterministic raw metrics + profile-driven scores (M4). */
export { computeRawMetrics, type RawMetrics, type RawMetricsInput } from "./metrics";
export {
  SCORING_PROFILES,
  getScoringProfile,
  listScoringProfiles,
  type ScoringProfile,
} from "./profiles";
export { computeScore, type ScoreResult } from "./score";
