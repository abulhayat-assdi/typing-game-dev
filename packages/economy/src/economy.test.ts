import { describe, expect, it } from "vitest";
import {
  DEFAULT_REWARD_PROFILE,
  computeCoinAward,
  computeXpAward,
} from "./rewards";
import { levelForXp, xpForLevelFormula, xpToNext } from "./levels";

const THRESHOLDS = [
  { level: 1, requiredXp: 0 },
  { level: 2, requiredXp: 30 },
  { level: 3, requiredXp: 80 },
  { level: 4, requiredXp: 150 },
  { level: 5, requiredXp: 250 },
];

describe("computeXpAward", () => {
  it("grants base + first-completion on a debut run", () => {
    const r = computeXpAward(
      { accuracy: 90, effectiveWpm: 20, isFirstCompletion: true, isPersonalBest: true },
    );
    // base 10 + first 20 + PB 15 = 45 (no milestones at 90%/20wpm)
    expect(r.xp).toBe(45);
    expect(r.parts).toMatchObject({ base: 10, first: 20, personalBest: 15 });
  });

  it("adds accuracy and speed milestones", () => {
    const r = computeXpAward(
      { accuracy: 97, effectiveWpm: 35, isFirstCompletion: false, isPersonalBest: false },
    );
    expect(r.xp).toBe(10 + 10 + 10);
  });

  it("grants base only on repeat runs below milestones", () => {
    expect(
      computeXpAward(
        { accuracy: 80, effectiveWpm: 10, isFirstCompletion: false, isPersonalBest: false },
      ).xp,
    ).toBe(10);
  });
});

describe("computeCoinAward", () => {
  it("grants base + PB bonus, never negative", () => {
    expect(
      computeCoinAward(
        { accuracy: 99, effectiveWpm: 60, isFirstCompletion: true, isPersonalBest: true },
      ),
    ).toBe(7);
    expect(
      computeCoinAward(
        { accuracy: 50, effectiveWpm: 5, isFirstCompletion: false, isPersonalBest: false },
      ),
    ).toBe(2);
  });
});

describe("levels", () => {
  it("resolves levels from data-driven thresholds", () => {
    expect(levelForXp(0, THRESHOLDS)).toBe(1);
    expect(levelForXp(29, THRESHOLDS)).toBe(1);
    expect(levelForXp(30, THRESHOLDS)).toBe(2);
    expect(levelForXp(249, THRESHOLDS)).toBe(4);
    expect(levelForXp(250, THRESHOLDS)).toBe(5);
    expect(levelForXp(100000, THRESHOLDS)).toBe(5);
  });

  it("computes XP to next level, zero when maxed", () => {
    expect(xpToNext(0, THRESHOLDS)).toBe(30);
    expect(xpToNext(30, THRESHOLDS)).toBe(50);
    expect(xpToNext(99999, THRESHOLDS)).toBe(0);
  });

  it("projects the spec curve formula without hard-coding it", () => {
    expect(xpForLevelFormula(1, 10)).toBe(10);
    expect(xpForLevelFormula(2, 10)).toBe(Math.round(10 * Math.pow(2, 1.55)));
    expect(() => xpForLevelFormula(0, 10)).toThrow();
    expect(() => xpForLevelFormula(2, 0)).toThrow();
    expect(() => levelForXp(0, [])).toThrow();
  });

  it("matches the M5 default profile constants", () => {
    expect(DEFAULT_REWARD_PROFILE).toMatchObject({
      xpCompletion: 10,
      coinCompletion: 2,
      xpFirstCompletion: 20,
      xpPersonalBest: 15,
      coinPersonalBest: 5,
    });
  });
});
