/**
 * M15 adaptive domain tests: keys, fingers, patterns, trends,
 * recommendations, difficulty, practice. DB-level cases live in
 * supabase/tests/m15_adaptive_test.sql.
 */
import { describe, expect, it } from "vitest";
import {
  accuracyTrend,
  aggregateFingers,
  alignKeys,
  bandFor,
  buildPracticeDrill,
  classifyKey,
  classifyPair,
  decideDifficulty,
  detectPatterns,
  errorRateTrend,
  fingerFor,
  rankCandidates,
  reasonMessage,
  trendOf,
  weaknessScore,
  weakestKeys,
  wpmTrend,
  type RecommendationCandidate,
  type WeaknessSignal,
} from "./index";

describe("key analysis", () => {
  it("aligns expected vs typed position-wise", () => {
    const a = alignKeys("abc", "axc");
    expect(a.keys.find((k) => k.key === "a")).toEqual({ key: "a", exposures: 1, errors: 0 });
    expect(a.keys.find((k) => k.key === "b")).toEqual({ key: "b", exposures: 1, errors: 1 });
    expect(a.pairs).toEqual([{ expected: "b", actual: "x", count: 1 }]);
  });

  it("detects weak keys and demands evidence", () => {
    expect(classifyKey(100, 15)).toBe("weak");
    expect(classifyKey(100, 30)).toBe("critical");
    expect(classifyKey(100, 1)).toBe("mastered");
    expect(classifyKey(5, 5)).toBe("insufficient");
    expect(classifyKey(0, 0)).toBe("insufficient");
  });

  it("ranks weakest keys first", () => {
    const out = weakestKeys([
      { key: "a", exposures: 100, errors: 2 },
      { key: "p", exposures: 100, errors: 25 },
      { key: "z", exposures: 3, errors: 3 },
    ]);
    expect(out.map((o) => o.key)).toEqual(["p"]);
  });
});

describe("finger analysis", () => {
  it("maps home-row keys to expected fingers", () => {
    expect(fingerFor("a")).toBe("left_pinky");
    expect(fingerFor("f")).toBe("left_index");
    expect(fingerFor("j")).toBe("right_index");
    expect(fingerFor(";")).toBe("right_pinky");
    expect(fingerFor(" ")).toBe("left_thumb");
    expect(fingerFor("P")).toBe("right_pinky");
    expect(fingerFor("€")).toBeNull();
  });

  it("aggregates key stats into weak fingers", () => {
    const stats = aggregateFingers([
      { key: "p", exposures: 60, errors: 10 },
      { key: "o", exposures: 60, errors: 8 },
      { key: "a", exposures: 60, errors: 1 },
    ]);
    const right = stats.find((s) => s.finger === "right_pinky");
    expect(right?.state).toBe("weak");
    const left = stats.find((s) => s.finger === "left_pinky");
    expect(left?.state).toBe("mastered");
  });
});

describe("error patterns", () => {
  it("classes pairs without hard-coding diagnoses", () => {
    expect(classifyPair("o", "p")).toBe("letter_confusion");
    expect(classifyPair("P", "p")).toBe("capitalization");
    expect(classifyPair("5", "%")).toBe("number_row");
    expect(classifyPair(",", "m")).toBe("punctuation");
    expect(classifyPair("e", " ")).toBe("space");
  });

  it("promotes recurring pairs to patterns", () => {
    const out = detectPatterns([
      { expected: "o", actual: "p", count: 5 },
      { expected: "e", actual: "r", count: 1 },
    ]);
    expect(out[0]).toMatchObject({ pattern: true, pairClass: "letter_confusion" });
    expect(out[1]).toMatchObject({ pattern: false });
  });
});

describe("weakness scoring", () => {
  it("combines documented factors without magic", () => {
    const full = weaknessScore({ errorRate: 0.25, evidenceCount: 8, exposures: 50, relevance: 1 });
    expect(full.score).toBeCloseTo(0.25, 5);
    expect(full.confidence).toBe(1);
    const thin = weaknessScore({ errorRate: 0.25, evidenceCount: 1, exposures: 5, relevance: 1 });
    expect(thin.score).toBeLessThan(full.score);
    expect(thin.confidence).toBeCloseTo(0.1, 5);
  });
});

describe("trends", () => {
  const series = (values: number[]): { value: number; atMs: number }[] =>
    values.map((value, i) => ({ value, atMs: 1000 + i * 1000 }));

  it("detects improving accuracy", () => {
    const r = accuracyTrend([...series([80, 81, 80, 82, 81, 80]), ...series([90, 91, 92, 91, 92, 90, 91, 92, 91, 90])]);
    expect(r.direction).toBe("improving");
    expect(r.recent).toBeGreaterThan(r.baseline ?? 0);
  });

  it("detects declining wpm and stable plateaus", () => {
    const down = wpmTrend([...series([40, 41, 40, 42, 41, 40]), ...series([28, 27, 29, 28, 27, 28, 27, 29, 28, 27])]);
    expect(down.direction).toBe("declining");
    const flat = wpmTrend(series([30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31]));
    expect(flat.direction).toBe("stable");
  });

  it("refuses trends on thin evidence and ignores one anomaly", () => {
    expect(trendOf(series([90, 91]), 1.5).direction).toBe("insufficient");
    const steady = series([90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 20]);
    expect(accuracyTrend(steady).direction).toBe("stable");
    expect(errorRateTrend(series([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).direction).toBe("stable");
  });
});

describe("recommendations", () => {
  const signal: WeaknessSignal = {
    target: "p",
    kind: "key",
    score: 0.22,
    confidence: 0.9,
    trend: "stable",
    promptKind: "words",
  };
  const candidates: RecommendationCandidate[] = [
    { gameSlug: "word-builder", mechanic: "word", promptKind: "words", active: true, unlocked: true, difficultyFit: 0.9, missionId: null, missionKind: null },
    { gameSlug: "speed-race", mechanic: "race", promptKind: "words", active: true, unlocked: true, difficultyFit: 0.5, missionId: null, missionKind: null },
    { gameSlug: "retired-game", mechanic: "word", promptKind: "words", active: false, unlocked: true, difficultyFit: 1, missionId: null, missionKind: null },
  ];

  it("picks the weakness-relevant unlocked active game", () => {
    const out = rankCandidates(signal, candidates, [], "beginner");
    expect(out.map((o) => o.gameSlug)).toEqual(["word-builder", "speed-race"]);
    expect(out[0]?.reason).toBe("WEAK_KEY");
    expect(out[0]?.targets).toEqual(["p"]);
  });

  it("applies fatigue diversity instead of spamming", () => {
    const out = rankCandidates(
      signal,
      candidates,
      [{ gameSlug: "word-builder", showsInWindow: 2 }],
      "beginner",
    );
    expect(out.map((o) => o.gameSlug)).toEqual(["speed-race"]);
  });

  it("uses positive mission-like language", () => {
    const msg = reasonMessage("WEAK_KEY", ["p", "o"], "key");
    expect(msg).toContain("practice");
    expect(msg).not.toMatch(/bad|fail|wrong/i);
  });
});

describe("adaptive difficulty", () => {
  const base = { promptMinLen: 15, promptMaxLen: 60, targetWpm: 30, targetAccuracy: 90 };
  const target = { targetAccuracy: 90, targetWpm: 30 };

  it("increases on sustained mastery", () => {
    const d = decideDifficulty(
      "intermediate",
      [
        { accuracy: 98, wpm: 35 },
        { accuracy: 99, wpm: 36 },
        { accuracy: 98, wpm: 34 },
      ],
      target,
      base,
    );
    expect(d.action).toBe("increase");
    expect(d.band).toBe("expert");
  });

  it("decreases on repeated struggle and clamps at beginner", () => {
    const d = decideDifficulty(
      "beginner",
      [
        { accuracy: 70, wpm: 10 },
        { accuracy: 72, wpm: 11 },
        { accuracy: 75, wpm: 12 },
      ],
      target,
      base,
    );
    expect(d.action).toBe("decrease");
    expect(d.band).toBe("beginner");
  });

  it("maintains on mixed form", () => {
    const d = decideDifficulty(
      "beginner",
      [
        { accuracy: 98, wpm: 35 },
        { accuracy: 70, wpm: 10 },
        { accuracy: 88, wpm: 25 },
      ],
      target,
      base,
    );
    expect(d.action).toBe("maintain");
    expect(d.band).toBe("beginner");
  });

  it("bands learners by overall level", () => {
    expect(bandFor(97, 55)).toBe("expert");
    expect(bandFor(88, 28)).toBe("intermediate");
    expect(bandFor(70, 12)).toBe("beginner");
    expect(bandFor(null, null)).toBe("beginner");
  });
});

describe("practice drills", () => {
  const words = ["pen", "open", "play", "apple", "hop", "top", "cat"];
  const sentences = ["Pop opens the box.", "Cats sit."];

  it("selects content-engine words containing weak keys", () => {
    const drill = buildPracticeDrill(["p", "o"], { words, sentences });
    expect(drill?.kind).toBe("words");
    expect(drill?.items.every((w) => /[po]/i.test(w))).toBe(true);
    expect(drill?.targetKeys).toEqual(["p", "o"]);
  });

  it("returns null without weak keys", () => {
    expect(buildPracticeDrill([], { words, sentences })).toBeNull();
  });
});
