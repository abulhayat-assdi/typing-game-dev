/**
 * Content scale-up schema (M19, Track B). Additive extensions to the M4
 * GameDefinition model — nothing here changes existing rows, routes, or
 * engines. A future game is: BatchGameSpec + prompt/content + unlock +
 * scoring ref + R2 assets + i18n, expanded to a full GameDefinition by
 * toGameDefinition() with mechanic-template defaults. Zero core-code
 * changes per game, enforced by scale-batch-validation.
 */
import type {
  AttemptRules,
  Difficulty,
  GameDefinition,
  GameMechanic,
  GameMode,
  InputRules,
  SkillBand,
  ThemeRef,
  TimingRules,
  UnlockRule,
} from "@tap/game-engine";

/**
 * The 21 skill focuses the final catalog must cover (M19 game-design
 * requirement). Every game declares 1-3; roadmaps assert breadth so the
 * catalog can never collapse into 200 copies of one typing test.
 */
export type SkillFocus =
  | "key-recognition"
  | "finger-placement"
  | "letter-accuracy"
  | "word-construction"
  | "word-reaction"
  | "sentence-typing"
  | "punctuation"
  | "capitalization"
  | "numbers"
  | "symbols"
  | "mixed-input"
  | "speed"
  | "accuracy"
  | "survival"
  | "race"
  | "defense"
  | "escape"
  | "collection"
  | "boss-preparation"
  | "competitive-preparation"
  | "endless-endurance";

export const SKILL_FOCUSES: readonly SkillFocus[] = [
  "key-recognition",
  "finger-placement",
  "letter-accuracy",
  "word-construction",
  "word-reaction",
  "sentence-typing",
  "punctuation",
  "capitalization",
  "numbers",
  "symbols",
  "mixed-input",
  "speed",
  "accuracy",
  "survival",
  "race",
  "defense",
  "escape",
  "collection",
  "boss-preparation",
  "competitive-preparation",
  "endless-endurance",
];

/**
 * One mechanic template (M19 Track B.3). Templates are DATA: cloning a
 * template + filling content fields is the entire act of creating a game.
 * `renderer` names the generic runtime contract the game-runtime UI
 * implements once per mechanic (9 mechanics already render; the 5 unused
 * ones need a one-time M20 renderer each — afterwards every game of that
 * mechanic is data-only forever).
 */
export interface MechanicTemplate {
  mechanic: GameMechanic;
  title: string;
  designIntent: string;
  supportedModes: GameMode[];
  defaultTiming: TimingRules;
  defaultInput: InputRules;
  defaultAttempt: AttemptRules;
  defaultScoring: string;
  /** Config keys the runtime reads for this mechanic (all data, no code). */
  requiredConfig: string[];
  suggestedSkills: SkillFocus[];
  /** Once-per-mechanic UI work remaining (none for the 9 shipped). */
  renderer: { status: "shipped" | "m20"; contract: string };
}

/** Authoring-time game spec. Expands to GameDefinition via a template. */
export interface BatchGameSpec {
  slug: string;
  title: { en: string; bn?: string };
  description: { en: string; bn?: string };
  worldSlug: string;
  category: string;
  mechanic: GameMechanic;
  mode: GameMode;
  difficulty: Difficulty;
  skillBands: SkillBand[];
  /** 1-3 entries from SKILL_FOCUSES. */
  skillFocus: SkillFocus[];
  promptRef: string;
  units: number;
  timingKind: TimingRules["kind"];
  limitSeconds?: number;
  scoringProfile: string;
  unlockRule: UnlockRule;
  attemptRules?: AttemptRules;
  inputRules?: InputRules;
  theme: ThemeRef;
  config?: Record<string, unknown>;
  /** Mission tags this game feeds (convention-based hooks, no engine). */
  missionTags?: string[];
  /** reward_events keys granted through this game (registry-checked). */
  rewardEventKeys?: string[];
  competitionEligible: boolean;
  /** Zero-stakes guest demo renders from the definition alone. Default true. */
  demoPlayable?: boolean;
}

/** R2 keys every game must ship (public, cache-friendly). */
export function requiredAssetsFor(gameSlug: string): string[] {
  return [`games/${gameSlug}/preview.png`, `games/${gameSlug}/art.png`];
}

/** Mission-tag charset (convention; the mission engine reads tags as data). */
export const MISSION_TAG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** reward_events key charset (registry membership checked separately). */
export const REWARD_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Expand an authoring spec into a full GameDefinition using template
 * defaults. This function is the executable proof of the no-core-code
 * rule: everything a game needs comes from spec + template + catalog.
 */
export function toGameDefinition(
  spec: BatchGameSpec,
  template: MechanicTemplate,
): GameDefinition {
  const timing: TimingRules =
    spec.timingKind === "untimed"
      ? { kind: "untimed" }
      : spec.limitSeconds === undefined
        ? { kind: spec.timingKind }
        : { kind: spec.timingKind, limitSeconds: spec.limitSeconds };
  return {
    id: `game-${spec.slug}`,
    slug: spec.slug,
    title: { en: spec.title.en, ...(spec.title.bn ? { bn: spec.title.bn } : {}) },
    description: {
      en: spec.description.en,
      ...(spec.description.bn ? { bn: spec.description.bn } : {}),
    },
    worldSlug: spec.worldSlug,
    category: spec.category,
    mechanic: spec.mechanic,
    mode: spec.mode,
    difficulty: spec.difficulty,
    skillBands: spec.skillBands,
    promptSource: { ref: spec.promptRef, units: spec.units },
    inputRules: spec.inputRules ?? template.defaultInput,
    timingRules: timing,
    scoringProfile: spec.scoringProfile,
    unlockRule: spec.unlockRule,
    attemptRules: spec.attemptRules ?? template.defaultAttempt,
    theme: spec.theme,
    config: spec.config ?? {},
    competitionEligible: spec.competitionEligible,
    isActive: true,
    version: 1,
  };
}
