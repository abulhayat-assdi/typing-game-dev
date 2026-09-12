/**
 * Error-pattern detection (M15). Data-driven: patterns emerge from
 * observed (expected → actual) confusion pairs, never from hard-coded
 * per-student diagnoses. Pair classes describe *what kind* of confusion
 * a pair is; recurrence across attempts promotes a pair to a pattern.
 */
import { ALGO_CONFIG } from "./types";

export type PairClass =
  | "letter_confusion"
  | "capitalization"
  | "punctuation"
  | "number_row"
  | "space"
  | "symbol"
  | "other";

const LETTER = /^[a-z]$/i;
const DIGIT = /^[0-9]$/;
const PUNCT = /^[.,;:!?'"()-]$/;

export function classifyPair(expected: string, actual: string): PairClass {
  if (expected === " " || actual === " ") return "space";
  if (
    expected.toLowerCase() === actual.toLowerCase() &&
    expected !== actual
  ) {
    return "capitalization";
  }
  if (LETTER.test(expected) && LETTER.test(actual)) return "letter_confusion";
  if (DIGIT.test(expected) || DIGIT.test(actual)) return "number_row";
  if (PUNCT.test(expected) || PUNCT.test(actual)) return "punctuation";
  if (expected.length === 1 && actual.length === 1) return "symbol";
  return "other";
}

export interface ErrorPattern {
  expected: string;
  actual: string;
  pairClass: PairClass;
  count: number;
  pattern: boolean;
}

/**
 * Rank observed pairs; a pair becomes a "pattern" at minPairCount
 * observations (configurable, documented). No pair is ever invented.
 */
export function detectPatterns(
  pairs: { expected: string; actual: string; count: number }[],
  limit = 5,
): ErrorPattern[] {
  return [...pairs]
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(limit, 1))
    .map((p) => ({
      ...p,
      pairClass: classifyPair(p.expected, p.actual),
      pattern: p.count >= ALGO_CONFIG.minPairCount,
    }));
}
