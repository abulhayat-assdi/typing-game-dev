/**
 * Skill dimensions + weakness scoring (M15). Interpretable dimensions
 * only — no single opaque skill score. Weakness is a documented product
 * of four bounded factors:
 *
 *   weakness = errorRate × recurrence × confidence × relevance
 *
 * - errorRate: errors / exposures (the raw gap).
 * - recurrence: min(1, evidenceCount / weaknessRecurrenceAt) — a gap seen
 *   across attempts matters more than a one-off.
 * - confidence: min(1, exposures / weaknessConfidenceAt) — more keypress
 *   evidence, surer diagnosis.
 * - relevance: 0..1 caller weight (prompt-class fit for the target).
 */
import {
  ALGO_CONFIG,
  type TrendSample,
  type WeaknessInput,
  type WeaknessScore,
} from "./types";

export const SKILL_DIMENSIONS = [
  "accuracy",
  "wpm",
  "consistency",
  "completion",
  "error_rate",
  "input_letters",
  "input_words",
  "input_sentences",
  "input_numbers",
  "input_punctuation",
  "input_capitalization",
  "input_symbols",
  "input_mixed",
  "mech_reaction",
  "mech_race",
  "mech_survival",
  "mech_sentence",
  "mech_word",
  "mech_mixed",
] as const;

export type SkillDimension = (typeof SKILL_DIMENSIONS)[number];

export function isSkillDimension(v: string): v is SkillDimension {
  return (SKILL_DIMENSIONS as readonly string[]).includes(v);
}

export function weaknessScore(input: WeaknessInput): WeaknessScore {
  const cfg = ALGO_CONFIG;
  const errorRate = Math.max(0, Math.min(1, input.errorRate));
  const recurrence = Math.max(
    0,
    Math.min(1, input.evidenceCount / cfg.weaknessRecurrenceAt),
  );
  const confidence = Math.max(
    0,
    Math.min(1, input.exposures / cfg.weaknessConfidenceAt),
  );
  const relevance = Math.max(0, Math.min(1, input.relevance));
  return {
    score: errorRate * recurrence * confidence * relevance,
    confidence,
    evidenceCount: Math.max(0, Math.floor(input.evidenceCount)),
  };
}

/** Recency-weighted mean (recent samples matter more, no cliff edge). */
export function weightedMean(samples: TrendSample[]): number | null {
  if (samples.length === 0) return null;
  const ordered = [...samples].sort((a, b) => a.atMs - b.atMs);
  let total = 0;
  let weight = 0;
  ordered.forEach((s, i) => {
    const w = i + 1;
    total += s.value * w;
    weight += w;
  });
  return total / weight;
}

/** Coefficient of variation inverted to a 0..100 consistency score. */
export function consistencyOf(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, 100 * (1 - Math.min(cv, 1))));
}
