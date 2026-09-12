/** @tap/adaptive - adaptive learning domain (M15). No UI imports. */
export { ALGO_CONFIG, ALGO_VERSION } from "./types";
export { SKILL_DIMENSIONS, isSkillDimension } from "./skills";
export type { SkillDimension } from "./skills";
export { aggregateFingers, fingerFor } from "./fingers";
export type { FingerStat } from "./fingers";
export { alignKeys, classifyKey, keyAccuracy, weakestKeys } from "./keys";
export { classifyPair, detectPatterns } from "./patterns";
export type { ErrorPattern, PairClass } from "./patterns";
export { accuracyTrend, errorRateTrend, trendOf, wpmTrend } from "./trends";
export { consistencyOf, weightedMean, weaknessScore } from "./skills";
export { bandFor, decideDifficulty, BAND_ORDER } from "./difficulty";
export type { BaseDifficultyParams, FormSample } from "./difficulty";
export { buildPracticeDrill, selectDrillSentences, selectDrillWords } from "./practice";
export type { PracticeDrill } from "./practice";
export { rankCandidates, reasonMessage, scoreCandidate } from "./recommend";
export type { ExposureInfo, ScoreInput, WeaknessSignal } from "./recommend";
export type {
  DifficultyDecision,
  DifficultyTarget,
  FingerName,
  KeyAlignment,
  KeyState,
  KeyStat,
  PracticeBand,
  ReasonCode,
  RecommendationCandidate,
  ScoredRecommendation,
  TrendDirection,
  TrendResult,
  TrendSample,
  WeaknessInput,
  WeaknessScore,
} from "./types";
