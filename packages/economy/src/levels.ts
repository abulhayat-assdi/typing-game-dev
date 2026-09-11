/**
 * Level mathematics (M5). Thresholds are DATA (levels table / seed); this
 * module resolves levels from totals and projects the spec's curve formula
 * for future adjustment proposals. Never hard-codes a curve into callers.
 */

export interface LevelThreshold {
  level: number;
  requiredXp: number;
}

/** Spec §8 formula for proposing curves: round(base * level^1.55). */
export function xpForLevelFormula(level: number, base: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error("level must be an integer >= 1");
  }
  if (!(base > 0)) throw new Error("base must be > 0");
  return Math.round(base * Math.pow(level, 1.55));
}

/** Highest level whose requirement the total satisfies (data-driven). */
export function levelForXp(totalXp: number, thresholds: LevelThreshold[]): number {
  if (thresholds.length === 0) throw new Error("thresholds must not be empty");
  const sorted = [...thresholds].sort((a, b) => a.requiredXp - b.requiredXp);
  let level = sorted[0]?.level ?? 1;
  for (const t of sorted) {
    if (totalXp >= t.requiredXp) level = t.level;
    else break;
  }
  return level;
}

/** XP still needed for the next level (0 when maxed). */
export function xpToNext(totalXp: number, thresholds: LevelThreshold[]): number {
  const sorted = [...thresholds].sort((a, b) => a.requiredXp - b.requiredXp);
  for (const t of sorted) {
    if (totalXp < t.requiredXp) return t.requiredXp - totalXp;
  }
  return 0;
}
