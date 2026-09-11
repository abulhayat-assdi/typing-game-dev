import { describe, expect, it } from "vitest";
import { validateGameDefinition } from "./definition";
import { allowedNext, canTransition, isTerminal } from "./lifecycle";
import type { GameDefinition } from "./types";

function validDef(): GameDefinition {
  return {
    id: "game-1",
    slug: "find-the-key",
    title: { en: "Find the Key" },
    description: { en: "Press the shown key." },
    worldSlug: "keyboard-village",
    category: "keyboard",
    mechanic: "target-press",
    mode: "letter",
    difficulty: "beginner",
    skillBands: ["beginner"],
    promptSource: { ref: "home-row-keys", units: 10 },
    inputRules: { allowBackspace: true, caseSensitive: true },
    timingRules: { kind: "untimed" },
    scoringProfile: "standard",
    unlockRule: { type: "open" },
    attemptRules: {
      maxAttemptsPerDay: null,
      cooldownSeconds: 0,
      expiresAfterSeconds: 900,
      allowRetry: true,
    },
    theme: { visual: "village", audio: "calm" },
    config: {},
    competitionEligible: false,
    isActive: true,
    version: 1,
  };
}

describe("validateGameDefinition", () => {
  it("accepts a well-formed definition", () => {
    expect(validateGameDefinition(validDef())).toEqual([]);
  });

  it("rejects bad slugs, enums and versions", () => {
    const bad = {
      ...validDef(),
      slug: "Bad Slug!",
      mechanic: "teleport",
      version: 0,
    };
    const errors = validateGameDefinition(bad);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.join(" ")).toMatch(/slug|mechanic|version/);
  });

  it("validates nested unlock groups", () => {
    const bad = {
      ...validDef(),
      unlockRule: { op: "and", rules: [{ type: "level" }] },
    };
    expect(validateGameDefinition(bad).length).toBeGreaterThan(0);
    const good = {
      ...validDef(),
      unlockRule: {
        op: "and",
        rules: [{ type: "level", min: 3 }, { type: "open" }],
      },
    };
    expect(validateGameDefinition(good)).toEqual([]);
  });

  it("rejects non-objects and missing prompt sources", () => {
    expect(validateGameDefinition(null)).not.toEqual([]);
    expect(
      validateGameDefinition({ ...validDef(), promptSource: { ref: "", units: 0 } }),
    ).not.toEqual([]);
  });
});

describe("attempt lifecycle", () => {
  it("walks the happy path", () => {
    expect(canTransition("created", "started")).toBe(true);
    expect(canTransition("started", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "submitted")).toBe(true);
    expect(canTransition("submitted", "validating")).toBe(true);
    expect(canTransition("validating", "validated")).toBe(true);
  });

  it("rejects illegal jumps and terminal exits", () => {
    expect(canTransition("created", "validated")).toBe(false);
    expect(canTransition("validated", "submitted")).toBe(false);
    expect(canTransition("submitted", "validated")).toBe(false);
    expect(isTerminal("validated")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("submitted")).toBe(false);
  });

  it("allows abandon/expire from live states and reject from review", () => {
    expect(allowedNext("started")).toContain("abandoned");
    expect(allowedNext("in_progress")).toContain("expired");
    expect(allowedNext("submitted")).toContain("rejected");
    expect(allowedNext("validating")).toEqual(
      expect.arrayContaining(["validated", "rejected"]),
    );
    expect(allowedNext("validated")).toEqual([]);
  });
});
