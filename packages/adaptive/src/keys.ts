/**
 * Key-level analysis (M15). Evidence comes from position-wise alignment
 * of the server-known prompt and the submitted text at submit time —
 * the M4 engine is untouched; this is a consumer of validated
 * submissions. Keys with too little evidence report "insufficient",
 * never a fake weakness.
 */
import { ALGO_CONFIG, type KeyAlignment, type KeyState } from "./types";

/** Canonical key form: single char, case-preserved (Shift errors matter). */
export function normalizeKey(ch: string): string | null {
  const chars = Array.from(ch);
  if (chars.length !== 1) return null;
  const c = chars[0] as string;
  if (c === "\n" || c === "\r" || c === "\t") return null;
  return c;
}

export function keyAccuracy(exposures: number, errors: number): number {
  if (exposures <= 0) return 0;
  return Math.max(0, Math.min(100, ((exposures - errors) / exposures) * 100));
}

export function classifyKey(exposures: number, errors: number): KeyState {
  if (exposures < ALGO_CONFIG.minKeyExposures) return "insufficient";
  const acc = keyAccuracy(exposures, errors);
  const cut = ALGO_CONFIG.keyCutoffs;
  if (acc >= cut.mastered) return "mastered";
  if (acc >= cut.strong) return "strong";
  if (acc >= cut.normal) return "normal";
  if (acc >= cut.weak) return "weak";
  return "critical";
}

/**
 * Align expected vs typed position-wise. Every expected char counts as
 * one exposure; mismatches count as errors on the expected key and
 * yield (expected → actual) confusion pairs. Untyped tail chars count
 * as exposures without errors (seen but not attempted — the sample's
 * completion metric carries the abandonment signal instead).
 */
export function alignKeys(expected: string, typed: string): KeyAlignment {
  const exp = Array.from(expected);
  const got = Array.from(typed);
  const byKey = new Map<string, { exposures: number; errors: number }>();
  const pairCounts = new Map<string, number>();
  for (let i = 0; i < exp.length; i += 1) {
    const e = normalizeKey(exp[i] as string);
    if (!e) continue;
    const cur = byKey.get(e) ?? { exposures: 0, errors: 0 };
    cur.exposures += 1;
    const g = i < got.length ? normalizeKey(got[i] as string) : null;
    if (g !== e) {
      cur.errors += 1;
      if (g) {
        const k = `${e}→${g}`;
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
      }
    }
    byKey.set(e, cur);
  }
  return {
    keys: [...byKey.entries()].map(([key, s]) => ({ key, ...s })),
    pairs: [...pairCounts.entries()].map(([k, count]) => {
      const [expectedCh, actualCh] = k.split("→") as [string, string];
      return { expected: expectedCh, actual: actualCh, count };
    }),
  };
}

/** Weakest keys first: highest error rate, then most evidence. */
export function weakestKeys(
  stats: { key: string; exposures: number; errors: number }[],
  limit = 5,
): { key: string; accuracy: number; exposures: number }[] {
  return stats
    .filter((s) => classifyKey(s.exposures, s.errors) === "weak" || classifyKey(s.exposures, s.errors) === "critical")
    .map((s) => ({
      key: s.key,
      accuracy: keyAccuracy(s.exposures, s.errors),
      exposures: s.exposures,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.exposures - a.exposures)
    .slice(0, Math.max(limit, 1));
}
