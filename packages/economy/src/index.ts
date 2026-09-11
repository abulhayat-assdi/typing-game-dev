/** @tap/economy — reward + level mathematics (M5). Writers live in SQL. */
export {
  DEFAULT_REWARD_PROFILE,
  computeCoinAward,
  computeXpAward,
  type AwardBreakdown,
  type RewardProfile,
  type ValidatedResultInput,
} from "./rewards";
export {
  levelForXp,
  xpForLevelFormula,
  xpToNext,
  type LevelThreshold,
} from "./levels";
