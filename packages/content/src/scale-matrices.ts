/**
 * Content matrices (M19, Track B.4-6). Mechanic x mode placements for the
 * shipped 26 games, the 16-world identity/capacity plan, difficulty cells,
 * and the M20 prompt-set backlog. Matrices are DATA consumed by validators
 * and roadmaps — editing them never touches engines, routes, or pages.
 */
import type { Difficulty, GameMode, SkillBand } from "@tap/game-engine";
import { DIFFICULTY_PROFILES } from "./difficulties";
import { GAMES } from "./games";
import type { PromptKind } from "./prompts";
import { WORLDS } from "./worlds";

/** One shipped placement in the mechanic x mode grid. */
export interface MechanicPlacement {
  mechanic: string;
  mode: GameMode;
  difficulty: Difficulty;
  gameSlug: string;
}

/**
 * Shipped mechanic x mode placements (26 = GAMES). Empty cells are
 * addressable by future batches; the 5 mechanics / 4 modes with zero
 * placements are the M20 priority backlog. A self-test asserts this
 * table matches GAMES exactly so the matrix can never drift.
 */
export const MECHANIC_MODE_PLACEMENTS: MechanicPlacement[] = [
  { mechanic: "target-press", mode: "letter", difficulty: "beginner", gameSlug: "find-the-key" },
  { mechanic: "collection", mode: "letter", difficulty: "beginner", gameSlug: "key-hunter" },
  { mechanic: "sequence-build", mode: "letter", difficulty: "beginner", gameSlug: "home-row-harbor" },
  { mechanic: "sequence-build", mode: "letter", difficulty: "beginner", gameSlug: "finger-forge" },
  { mechanic: "falling-catch", mode: "letter", difficulty: "beginner", gameSlug: "letter-rain" },
  { mechanic: "collection", mode: "letter", difficulty: "beginner", gameSlug: "letter-hunt" },
  { mechanic: "escape-run", mode: "letter", difficulty: "intermediate", gameSlug: "letter-maze" },
  { mechanic: "sequence-build", mode: "word", difficulty: "beginner", gameSlug: "word-builder" },
  { mechanic: "falling-catch", mode: "word", difficulty: "beginner", gameSlug: "word-catcher" },
  { mechanic: "time-trial", mode: "word", difficulty: "intermediate", gameSlug: "word-sprint" },
  { mechanic: "target-press", mode: "word", difficulty: "intermediate", gameSlug: "word-ninja" },
  { mechanic: "sequence-build", mode: "sentence", difficulty: "beginner", gameSlug: "sentence-steps" },
  { mechanic: "race-checkpoints", mode: "sentence", difficulty: "intermediate", gameSlug: "sentence-run" },
  { mechanic: "escape-run", mode: "sentence", difficulty: "intermediate", gameSlug: "sentence-river" },
  { mechanic: "time-trial", mode: "mixed", difficulty: "intermediate", gameSlug: "minute-dash" },
  { mechanic: "time-trial", mode: "mixed", difficulty: "intermediate", gameSlug: "two-minute-trail" },
  { mechanic: "race-checkpoints", mode: "mixed", difficulty: "expert", gameSlug: "speed-tunnel" },
  { mechanic: "accuracy-trial", mode: "mixed", difficulty: "intermediate", gameSlug: "accuracy-temple" },
  { mechanic: "survival-waves", mode: "mixed", difficulty: "intermediate", gameSlug: "combo-canyon" },
  { mechanic: "survival-waves", mode: "word", difficulty: "expert", gameSlug: "no-mistake-bridge" },
  { mechanic: "escape-run", mode: "sentence", difficulty: "intermediate", gameSlug: "jungle-escape" },
  { mechanic: "race-checkpoints", mode: "word", difficulty: "intermediate", gameSlug: "sky-typist" },
  { mechanic: "escape-run", mode: "mixed", difficulty: "expert", gameSlug: "space-run" },
  { mechanic: "target-press", mode: "word", difficulty: "expert", gameSlug: "word-sniper" },
  { mechanic: "time-trial", mode: "sentence", difficulty: "expert", gameSlug: "sentence-blitz" },
  { mechanic: "accuracy-trial", mode: "symbol", difficulty: "expert", gameSlug: "precision-grid" },
];

/** Mechanics with zero shipped placements (M20 renderer + content backlog). */
export const UNUSED_MECHANICS = [
  "defense-shield",
  "boss-phased",
  "duel-rounds",
  "endless",
  "relay-team",
] as const;

/** Modes with zero shipped placements (M20 content backlog). */
export const UNUSED_MODES: GameMode[] = ["number", "paragraph", "story", "shortcut"];

/** World identity + capacity plan for the 200-game catalog. */
export interface WorldCell {
  slug: string;
  order: number;
  identity: string;
  skillBands: SkillBand[];
  /** Catalog-size targets: [min@100 games, max@200 games]. */
  capacity100: number;
  capacity200: number;
}

export const WORLD_MATRIX: WorldCell[] = [
  { slug: "keyboard-village", order: 1, identity: "Key-recognition onboarding: meet every key.", skillBands: ["beginner"], capacity100: 6, capacity200: 12 },
  { slug: "finger-forest", order: 2, identity: "Finger placement: map fingers to keys.", skillBands: ["beginner"], capacity100: 5, capacity200: 12 },
  { slug: "letter-valley", order: 3, identity: "Letter accuracy and reaction chases.", skillBands: ["beginner", "intermediate"], capacity100: 6, capacity200: 12 },
  { slug: "word-city", order: 4, identity: "Word construction and reaction.", skillBands: ["beginner", "intermediate"], capacity100: 9, capacity200: 14 },
  { slug: "sentence-kingdom", order: 5, identity: "Sentence typing, punctuation, capitalization.", skillBands: ["intermediate"], capacity100: 8, capacity200: 13 },
  { slug: "speed-arena", order: 6, identity: "Speed benchmarks against the clock.", skillBands: ["intermediate", "expert"], capacity100: 9, capacity200: 14 },
  { slug: "sky-frontier", order: 7, identity: "Word-stream flight and sky races.", skillBands: ["intermediate"], capacity100: 5, capacity200: 12 },
  { slug: "jungle-escape", order: 8, identity: "Escape runs through the wild.", skillBands: ["beginner", "intermediate"], capacity100: 5, capacity200: 12 },
  { slug: "desert-rally", order: 9, identity: "Gate-to-gate dune racing.", skillBands: ["intermediate"], capacity100: 5, capacity200: 12 },
  { slug: "ocean-depths", order: 10, identity: "Survival pressure before oxygen runs out.", skillBands: ["intermediate", "expert"], capacity100: 5, capacity200: 12 },
  { slug: "arctic-pass", order: 11, identity: "Accuracy under cold-rush pressure.", skillBands: ["intermediate", "expert"], capacity100: 5, capacity200: 12 },
  { slug: "space-station", order: 12, identity: "Numbers/symbols command restoration.", skillBands: ["intermediate", "expert"], capacity100: 5, capacity200: 12 },
  { slug: "cyber-city", order: 13, identity: "Precision hacking on the neon grid.", skillBands: ["expert"], capacity100: 7, capacity200: 13 },
  { slug: "volcano-zone", order: 14, identity: "Survival waves above rising lava.", skillBands: ["intermediate", "expert"], capacity100: 5, capacity200: 12 },
  { slug: "castle-siege", order: 15, identity: "Wall defense, word by word.", skillBands: ["intermediate", "expert"], capacity100: 5, capacity200: 12 },
  { slug: "grand-arena", order: 16, identity: "Championship mix and competitive finals.", skillBands: ["expert"], capacity100: 10, capacity200: 14 },
];

/** Current shipped game count per world (derived from GAMES; test-checked). */
export function shippedCountsByWorld(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const g of GAMES) counts[g.worldSlug] = (counts[g.worldSlug] ?? 0) + 1;
  return counts;
}

/** Difficulty cell: tier calibration for batch validation (Track B.6). */
export interface DifficultyCell {
  tier: Difficulty;
  /** Allowed prompt units (item counts), calibrated to the shipped catalog. */
  unitsMin: number;
  unitsMax: number;
  targetAccuracy: number;
  targetWpm: number;
  sequenceComplexity: number;
  vocabSets: string[];
}

export const DIFFICULTY_MATRIX: Record<Difficulty, DifficultyCell> = {
  beginner: {
    tier: "beginner", unitsMin: 3, unitsMax: 24,
    targetAccuracy: DIFFICULTY_PROFILES.beginner.targetAccuracy,
    targetWpm: DIFFICULTY_PROFILES.beginner.targetWpm,
    sequenceComplexity: DIFFICULTY_PROFILES.beginner.sequenceComplexity,
    vocabSets: DIFFICULTY_PROFILES.beginner.vocabSets,
  },
  intermediate: {
    tier: "intermediate", unitsMin: 5, unitsMax: 48,
    targetAccuracy: DIFFICULTY_PROFILES.intermediate.targetAccuracy,
    targetWpm: DIFFICULTY_PROFILES.intermediate.targetWpm,
    sequenceComplexity: DIFFICULTY_PROFILES.intermediate.sequenceComplexity,
    vocabSets: DIFFICULTY_PROFILES.intermediate.vocabSets,
  },
  expert: {
    tier: "expert", unitsMin: 8, unitsMax: 60,
    targetAccuracy: DIFFICULTY_PROFILES.expert.targetAccuracy,
    targetWpm: DIFFICULTY_PROFILES.expert.targetWpm,
    sequenceComplexity: DIFFICULTY_PROFILES.expert.sequenceComplexity,
    vocabSets: DIFFICULTY_PROFILES.expert.vocabSets,
  },
};

/**
 * Per-kind units bands. Paragraphs and shortcuts count sessions, not
 * keystrokes: 1-8 paragraphs (or 6-30 shortcut combos) is a full session
 * at any tier, so they override the tier bands in validation.
 */
export const KIND_UNITS_BANDS: Partial<Record<PromptKind, { min: number; max: number }>> = {
  paragraphs: { min: 1, max: 8 },
  shortcuts: { min: 6, max: 30 },
};

/** Prompt sets reserved for M20 authoring (refs must not collide; kinds valid). */
export interface PlannedPromptSet {
  ref: string;
  kind: PromptKind;
  language: string;
  unitsGuidance: string;
  tier: Difficulty;
}

export const PLANNED_PROMPT_SETS: PlannedPromptSet[] = [
  { ref: "numbers-extended", kind: "numbers", language: "numeric", unitsGuidance: "20-60 digit groups incl. decimals", tier: "intermediate" },
  { ref: "symbols-extended", kind: "symbols", language: "symbolic", unitsGuidance: "15-40 mixed symbols incl. brackets", tier: "intermediate" },
  { ref: "code-tokens", kind: "words", language: "en", unitsGuidance: "10-30 code-flavored tokens", tier: "expert" },
  { ref: "punctuated-sentences", kind: "sentences", language: "en", unitsGuidance: "4-12 comma/colon-heavy sentences", tier: "intermediate" },
  { ref: "capitalized-sentences", kind: "sentences", language: "en", unitsGuidance: "4-12 proper-noun sentences", tier: "intermediate" },
  { ref: "paragraphs-starter", kind: "paragraphs", language: "en", unitsGuidance: "1-3 short paragraphs", tier: "intermediate" },
  { ref: "story-chapters", kind: "paragraphs", language: "en", unitsGuidance: "2-5 adventure paragraphs", tier: "expert" },
  { ref: "shortcut-basics", kind: "shortcuts", language: "symbolic", unitsGuidance: "8-16 single-modifier combos", tier: "beginner" },
  { ref: "shortcut-pro", kind: "shortcuts", language: "symbolic", unitsGuidance: "10-24 multi-modifier combos", tier: "expert" },
];

/** Every matrix world slug must be a real catalog world (test-checked). */
export function matrixWorldSlugs(): string[] {
  return WORLD_MATRIX.map((w) => w.slug);
}

export function catalogWorldSlugs(): string[] {
  return WORLDS.map((w) => w.slug);
}
