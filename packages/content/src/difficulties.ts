/**
 * Difficulty profiles as DATA (M4). Registration skill-track selection feeds
 * recommendations later; this module only defines what each tier demands.
 * Mirrors the difficulty_profiles table (0006 migration + seed).
 */
import type { Difficulty } from "@tap/game-engine";

export interface DifficultyProfile {
  id: Difficulty;
  promptLength: { min: number; max: number };
  /** Prompt-set refs suitable for this tier, in preference order. */
  vocabSets: string[];
  /** Errors tolerated before a run fails soft checks (0 = flawless-only). */
  allowedErrors: number;
  targetAccuracy: number;
  targetWpm: number;
  /** Suggested session seconds (0 = untimed). */
  durationSec: number;
  /** 0..1 share of punctuation/numbers/symbols in generated prompts. */
  punctuation: number;
  numbers: number;
  symbols: number;
  /** 1 (single keys) .. 5 (multi-stage mixed sequences). */
  sequenceComplexity: number;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  beginner: {
    id: "beginner",
    promptLength: { min: 5, max: 20 },
    vocabSets: ["home-row", "alphabet-lower", "beginner-words", "short-sentences"],
    allowedErrors: 5,
    targetAccuracy: 85,
    targetWpm: 15,
    durationSec: 0,
    punctuation: 0,
    numbers: 0,
    symbols: 0,
    sequenceComplexity: 1,
  },
  intermediate: {
    id: "intermediate",
    promptLength: { min: 15, max: 60 },
    vocabSets: ["common-words", "short-sentences", "standard-sentences", "numbers"],
    allowedErrors: 3,
    targetAccuracy: 90,
    targetWpm: 30,
    durationSec: 60,
    punctuation: 0.2,
    numbers: 0.1,
    symbols: 0.05,
    sequenceComplexity: 3,
  },
  expert: {
    id: "expert",
    promptLength: { min: 40, max: 200 },
    vocabSets: ["standard-sentences", "common-words", "numbers", "symbols"],
    allowedErrors: 1,
    targetAccuracy: 95,
    targetWpm: 50,
    durationSec: 120,
    punctuation: 0.35,
    numbers: 0.2,
    symbols: 0.15,
    sequenceComplexity: 5,
  },
};

export function getDifficultyProfile(id: string): DifficultyProfile {
  const profile = (DIFFICULTY_PROFILES as Record<string, DifficultyProfile>)[id];
  if (!profile) throw new Error(`Unknown difficulty profile "${id}"`);
  return profile;
}
