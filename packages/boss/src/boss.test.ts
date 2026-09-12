import { describe, expect, it } from "vitest";
import { damageFor, validateDamageProfile } from "./damage";
import {
  applyDamage,
  attemptAllowedInPhase,
  isTerminalStatus,
  phaseForHp,
  validatePhases,
} from "./phases";
import type { BossPhase } from "./types";

const PHASES: BossPhase[] = [
  { position: 0, name: "Shell", hpFrom: 100, hpTo: 50, damageMultiplier: 1 },
  { position: 1, name: "Core", hpFrom: 50, hpTo: 0, damageMultiplier: 2 },
];

describe("damageFor", () => {
  it("computes score and wpm formulas", () => {
    const m = { score: 70, effectiveWpm: 40, accuracy: 95, gameSlug: "g", worldId: "w" };
    expect(
      damageFor({ formula: "score_x_mult", multiplier: 1 }, m, 1),
    ).toBe(70);
    expect(
      damageFor({ formula: "score_x_mult", multiplier: 1 }, m, 2),
    ).toBe(140);
    expect(
      damageFor({ formula: "wpm_x_acc", multiplier: 2 }, m, 1),
    ).toBe(Math.floor(40 * 0.95 * 2));
    expect(damageFor({ formula: "score_x_mult", multiplier: -1 }, m, 1)).toBe(70);
    expect(
      damageFor(
        { formula: "score_x_mult", multiplier: 1 },
        { ...m, score: Number.NaN },
        1,
      ),
    ).toBe(0);
  });

  it("validates stored profiles", () => {
    expect(
      validateDamageProfile({ formula: "score_x_mult", multiplier: 1 }).ok,
    ).toBe(true);
    expect(
      validateDamageProfile({ formula: "chaos", multiplier: 1 }).errors,
    ).toContain("UNKNOWN_FORMULA");
    expect(validateDamageProfile(null).errors).toContain("MALFORMED");
  });
});

describe("phaseForHp", () => {
  it("resolves bands with boundaries in the next phase", () => {
    expect(phaseForHp(PHASES, 100)).toBe(0);
    expect(phaseForHp(PHASES, 75)).toBe(0);
    expect(phaseForHp(PHASES, 50)).toBe(1);
    expect(phaseForHp(PHASES, 0)).toBe(1);
  });

  it("validates band structure", () => {
    expect(validatePhases(PHASES, 100).ok).toBe(true);
    expect(validatePhases([], 100).errors).toContain("NO_PHASES");
    expect(
      validatePhases(
        [{ position: 0, name: "x", hpFrom: 10, hpTo: 20, damageMultiplier: 1 }],
        100,
      ).errors,
    ).toContain("INVERTED_BAND");
    expect(
      validatePhases(
        [{ position: 0, name: "x", hpFrom: 100, hpTo: 10, damageMultiplier: 1 }],
        100,
      ).errors,
    ).toContain("BOTTOM_BAND_MUST_REACH_ZERO");
  });
});

describe("attemptAllowedInPhase", () => {
  it("enforces pool and accuracy bars", () => {
    const m = { score: 70, effectiveWpm: 40, accuracy: 95, gameSlug: "g", worldId: "w" };
    expect(attemptAllowedInPhase(undefined, m)).toEqual({ ok: true, reason: null });
    expect(
      attemptAllowedInPhase({ ...PHASES[0], games: ["other"] } as BossPhase, m).reason,
    ).toBe("GAME_NOT_ALLOWED");
    expect(
      attemptAllowedInPhase({ ...PHASES[0], minAccuracy: 99 } as BossPhase, m).reason,
    ).toBe("BELOW_PHASE_BAR");
  });
});

describe("lifecycle helpers", () => {
  it("applies damage with a floor and marks terminals", () => {
    expect(applyDamage(30, 50)).toBe(0);
    expect(applyDamage(100, 25)).toBe(75);
    expect(isTerminalStatus("finalized")).toBe(true);
    expect(isTerminalStatus("active")).toBe(false);
  });
});
