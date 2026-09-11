/** @tap/game-engine — reusable typing/game foundation (M4). No UI imports. */
export {
  validateGameDefinition,
  type Difficulty,
  type GameDefinition,
  type GameMechanic,
  type GameMode,
  type SkillBand,
  type UnlockRule,
} from "./definition";
export {
  allowedNext,
  canTransition,
  isTerminal,
  type AttemptStatus,
} from "./lifecycle";
export {
  createTypingSession,
  diffExpected,
  type KeyOutcome,
  type TypingSession,
  type TypingSessionOptions,
  type TypingSnapshot,
} from "./typing";
export {
  validateSubmission,
  type SubmissionEvidence,
  type ValidationLimits,
  type ValidationVerdict,
} from "./validation";
export type {
  AttemptRules,
  GameMechanic as Mechanic,
  GameMode as Mode,
  InputRules,
  LocalizedText,
  PromptSource,
  ThemeRef,
  TimingRules,
  UnlockCondition,
  UnlockGroup,
} from "./types";
