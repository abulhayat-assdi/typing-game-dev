import { describe, expect, it } from "vitest";
import { computeRawMetrics } from "./metrics";
import { computeScore } from "./score";
import { getScoringProfile, listScoringProfiles } from "./profiles";

describe("computeRawMetrics", () => {
  it("applies the spec WPM and accuracy formulas", () => {
    // 300 correct chars in 60s → 60 WPM; 300/320 → 93.75%.
    const m = computeRawMetrics({
      correctChars: 300,
      typedLength: 320,
      elapsedMs: 60000,
    });
    expect(m.effectiveWpm).toBeCloseTo(60, 5);
    expect(m.rawWpm).toBeCloseTo(64, 5);
    expect(m.accuracy).toBeCloseTo(93.75, 5);
    expect(m.incorrectCharacters).toBe(20);
  });

  it("guards zero characters and zero duration", () => {
    const m = computeRawMetrics({
      correctChars: 0,
      typedLength: 0,
      elapsedMs: 0,
    });
    expect(m.accuracy).toBe(0);
    expect(m.effectiveWpm).toBe(0);
    expect(m.rawWpm).toBe(0);
    expect(m.completion).toBe(0);
  });

  it("clamps inconsistent counts instead of producing negatives", () => {
    const m = computeRawMetrics({
      correctChars: 500,
      typedLength: 100,
      corrections: 999,
      elapsedMs: -100,
    });
    expect(m.correctCharacters).toBe(100);
    expect(m.incorrectCharacters).toBe(0);
    expect(m.durationMs).toBe(0);
  });

  it("tracks corrections, completion and words", () => {
    const m = computeRawMetrics({
      correctChars: 90,
      typedLength: 100,
      corrections: 8,
      errorStrokes: 18,
      elapsedMs: 30000,
      completedWords: 15,
      expectedLength: 100,
    });
    expect(m.correctedCharacters).toBe(8);
    expect(m.errorStrokes).toBe(18);
    expect(m.completedWords).toBe(15);
    expect(m.completion).toBe(100);
  });
});

describe("scoring profiles", () => {
  it("exposes the six catalog profiles", () => {
    const ids = listScoringProfiles().map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "standard",
        "speed",
        "accuracy",
        "survival",
        "boss",
        "clan-aggregate",
      ]),
    );
  });

  it("rejects unknown profiles", () => {
    expect(() => getScoringProfile("nope")).toThrow(/Unknown scoring profile/);
  });
});

describe("computeScore", () => {
  const metrics = computeRawMetrics({
    correctChars: 300,
    typedLength: 320,
    elapsedMs: 60000,
    expectedLength: 320,
  });

  it("is deterministic", () => {
    expect(computeScore(metrics, "standard")).toEqual(
      computeScore(metrics, "standard"),
    );
  });

  it("varies by profile without engine changes", () => {
    const speed = computeScore(metrics, "speed").score;
    const accuracy = computeScore(metrics, "accuracy").score;
    const standard = computeScore(metrics, "standard").score;
    expect(new Set([speed, accuracy, standard]).size).toBe(3);
  });

  it("rewards flawless runs and explains the breakdown", () => {
    const clean = computeRawMetrics({
      correctChars: 100,
      typedLength: 100,
      elapsedMs: 60000,
      expectedLength: 100,
    });
    const r = computeScore(clean, "standard");
    expect(r.breakdown.flawlessPart).toBe(25);
    expect(r.breakdown.wpmPart + r.breakdown.accuracyPart).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThan(
      computeScore({ ...clean, incorrectCharacters: 1 }, "standard").score,
    );
  });

  it("never scores empty attempts", () => {
    const empty = computeRawMetrics({
      correctChars: 0,
      typedLength: 0,
      elapsedMs: 0,
    });
    expect(computeScore(empty, "standard").score).toBe(0);
  });
});
