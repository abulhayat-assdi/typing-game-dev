/**
 * Game-definition type system (M4). One schema describes hundreds of games;
 * mechanics render definitions — never the reverse. UI-free and edge-safe.
 */

export type GameMode =
  | "letter"
  | "word"
  | "sentence"
  | "number"
  | "symbol"
  | "mixed"
  | "paragraph"
  | "story"
  | "shortcut";

export type GameMechanic =
  | "target-press"
  | "falling-catch"
  | "sequence-build"
  | "time-trial"
  | "accuracy-trial"
  | "survival-waves"
  | "race-checkpoints"
  | "defense-shield"
  | "escape-run"
  | "collection"
  | "boss-phased"
  | "duel-rounds"
  | "endless"
  | "relay-team";

export type Difficulty = "beginner" | "intermediate" | "expert";

export type SkillBand = "beginner" | "intermediate" | "expert";

export interface LocalizedText {
  en: string;
  bn?: string;
}

export type UnlockCondition =
  | { type: "open" }
  | { type: "level"; min: number }
  | { type: "xp"; min: number }
  | { type: "accuracy"; min: number }
  | { type: "wpm"; min: number }
  | { type: "missionsCompleted"; count: number; tag?: string }
  | { type: "gamesCompleted"; gameSlugs: string[] }
  | { type: "badge"; badgeSlug: string };

export interface UnlockGroup {
  op: "and" | "or";
  rules: Array<UnlockRule>;
}

export type UnlockRule = UnlockCondition | UnlockGroup;

export interface AttemptRules {
  maxAttemptsPerDay: number | null;
  cooldownSeconds: number;
  /** Server-side expiry window for a started attempt. */
  expiresAfterSeconds: number;
  allowRetry: boolean;
}

export interface TimingRules {
  kind: "untimed" | "countdown" | "countup";
  limitSeconds?: number;
}

export interface InputRules {
  allowBackspace: boolean;
  caseSensitive: boolean;
}

export interface PromptSource {
  /** Catalog prompt-set slug, e.g. "common-words-1". */
  ref: string;
  /** How many units (keys/words/sentences) to draw. */
  units: number;
}

export interface ThemeRef {
  visual: string;
  audio: string;
}

export interface GameDefinition {
  id: string;
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  worldSlug: string;
  category: string;
  mechanic: GameMechanic;
  mode: GameMode;
  difficulty: Difficulty;
  skillBands: SkillBand[];
  promptSource: PromptSource;
  inputRules: InputRules;
  timingRules: TimingRules;
  /** scoring profile id (see @tap/scoring + scoring_profiles table). */
  scoringProfile: string;
  unlockRule: UnlockRule;
  attemptRules: AttemptRules;
  theme: ThemeRef;
  /** Mechanic-specific parameters (target count, wave shape, …). */
  config: Record<string, unknown>;
  competitionEligible: boolean;
  isActive: boolean;
  /** Definition version — attempts bind the version they ran. */
  version: number;
}
