import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, catalogStats, validateCatalog } from "./catalog";
import { DIFFICULTY_PROFILES } from "./difficulties";
import { GAMES } from "./games";
import { buildPrompt, getPromptSet, modesForKind } from "./prompts";
import { WORLDS } from "./worlds";

describe("content catalog", () => {
  it("validates clean with zero errors", () => {
    expect(validateCatalog()).toEqual([]);
  });

  it("ships the M4 representative catalog", () => {
    expect(CATALOG_VERSION).toBe(1);
    expect(GAMES.length).toBe(26);
    expect(WORLDS.length).toBe(16);
    const stats = catalogStats();
    expect(stats.games).toBe(26);
    expect(stats.mechanics).toBeGreaterThanOrEqual(8);
    const modes = new Set(GAMES.map((g) => g.mode));
    for (const m of ["letter", "word", "sentence", "mixed", "symbol"]) {
      expect(modes.has(m as never), `mode ${m} covered`).toBe(true);
    }
  });

  it("covers every mechanic family from the M4 list", () => {
    const slugs = new Set(GAMES.map((g) => g.slug));
    for (const s of [
      "find-the-key", "key-hunter", "home-row-harbor", "finger-forge",
      "letter-rain", "letter-hunt", "letter-maze",
      "word-builder", "word-catcher", "word-sprint", "word-ninja",
      "sentence-steps", "sentence-run", "sentence-river",
      "minute-dash", "two-minute-trail", "speed-tunnel", "accuracy-temple",
      "combo-canyon", "no-mistake-bridge",
      "jungle-escape", "sky-typist", "space-run",
      "word-sniper", "sentence-blitz", "precision-grid",
    ]) {
      expect(slugs.has(s), `catalog has ${s}`).toBe(true);
    }
  });

  it("rejects duplicates and dangling references", () => {
    const dup = [...GAMES, GAMES[0] as (typeof GAMES)[number]];
    expect(
      validateCatalog({ games: dup }).some((e) => e.includes("duplicate")),
    ).toBe(true);
    const badWorld = GAMES.map((g) =>
      g.slug === "find-the-key" ? { ...g, worldSlug: "nope" } : g,
    );
    expect(
      validateCatalog({ games: badWorld }).some((e) => e.includes("unknown world")),
    ).toBe(true);
    const badProfile = GAMES.map((g) =>
      g.slug === "find-the-key" ? { ...g, scoringProfile: "nope" } : g,
    );
    expect(
      validateCatalog({ games: badProfile }).some((e) =>
        e.includes("scoring profile"),
      ),
    ).toBe(true);
  });

  it("defines the three difficulty tiers", () => {
    for (const id of ["beginner", "intermediate", "expert"] as const) {
      const d = DIFFICULTY_PROFILES[id];
      expect(d.promptLength.min).toBeLessThan(d.promptLength.max);
      expect(d.targetAccuracy).toBeGreaterThan(0);
      expect(d.sequenceComplexity).toBeGreaterThanOrEqual(1);
      expect(d.vocabSets.length).toBeGreaterThan(0);
      for (const ref of d.vocabSets) {
        expect(() => getPromptSet(ref)).not.toThrow();
      }
    }
    expect(DIFFICULTY_PROFILES.beginner.targetWpm).toBeLessThan(
      DIFFICULTY_PROFILES.expert.targetWpm,
    );
  });
});

describe("prompt generation", () => {
  it("is deterministic for identical inputs", () => {
    const a = buildPrompt("common-words", 10, "seed-1");
    const b = buildPrompt("common-words", 10, "seed-1");
    expect(a).toEqual(b);
    expect(a.setVersion).toBe(1);
    expect(a.units).toBe(10);
  });

  it("varies with seed and rejects bad inputs", () => {
    const a = buildPrompt("common-words", 10, "seed-1");
    const b = buildPrompt("common-words", 10, "seed-2");
    expect(a.text).not.toBe(b.text);
    expect(() => buildPrompt("nope", 10, "s")).toThrow(/Unknown prompt set/);
    expect(() => buildPrompt("common-words", 0, "s")).toThrow(/positive integer/);
  });

  it("joins units per kind and maps modes", () => {
    expect(buildPrompt("beginner-words", 3, "s").text.split(" ")).toHaveLength(3);
    expect(buildPrompt("short-sentences", 2, "s").text.length).toBeGreaterThan(10);
    // Every kind serves its home mode plus mixed (mixed draws across kinds).
    expect(modesForKind("letters")).toEqual(["letter", "mixed"]);
    expect(modesForKind("symbols")).toEqual(["symbol", "mixed"]);
    expect(modesForKind("paragraphs")).toEqual(["paragraph", "story", "mixed"]);
  });
});
