import { describe, expect, it } from "vitest";
import type { UnlockRule } from "@tap/game-engine";
import { evaluateUnlock, type UnlockStats } from "./unlocks";
import { achievementReached, badgeEarned } from "./milestones";
import { isRecordBroken } from "./records";

const STATS: UnlockStats = {
  level: 5,
  totalXp: 300,
  bestAccuracy: 92,
  bestWpm: 35,
  completedMissions: 0,
  completedGames: ["find-the-key", "word-builder"],
  badges: ["first-key"],
  worldsCompleted: [],
};

describe("evaluateUnlock", () => {
  it("opens open rules", () => {
    expect(evaluateUnlock(STATS, { type: "open" }).unlocked).toBe(true);
  });

  it("checks leaf conditions with explanations", () => {
    const ok = evaluateUnlock(STATS, { type: "level", min: 5 });
    expect(ok.unlocked).toBe(true);
    const bad = evaluateUnlock(STATS, { type: "wpm", min: 60 });
    expect(bad.unlocked).toBe(false);
    expect(bad.missing.join(" ")).toMatch(/60 WPM/);
  });

  it("evaluates AND groups (all must hold)", () => {
    const rule: UnlockRule = {
      op: "and",
      rules: [
        { type: "level", min: 5 },
        { type: "accuracy", min: 90 },
      ],
    };
    expect(evaluateUnlock(STATS, rule).unlocked).toBe(true);
    const failing: UnlockRule = {
      op: "and",
      rules: [
        { type: "level", min: 5 },
        { type: "accuracy", min: 99 },
      ],
    };
    const v = evaluateUnlock(STATS, failing);
    expect(v.unlocked).toBe(false);
    expect(v.missing.join(" ")).toMatch(/99%/);
  });

  it("evaluates OR groups (one suffices)", () => {
    const rule: UnlockRule = {
      op: "or",
      rules: [
        { type: "gamesCompleted", gameSlugs: ["find-the-key"] },
        { type: "level", min: 99 },
      ],
    };
    expect(evaluateUnlock(STATS, rule).unlocked).toBe(true);
  });

  it("handles nested groups and game/badge prerequisites", () => {
    const rule: UnlockRule = {
      op: "and",
      rules: [
        {
          op: "or",
          rules: [
            { type: "gamesCompleted", gameSlugs: ["word-builder"] },
            { type: "badge", badgeSlug: "speed-demon" },
          ],
        },
        { type: "xp", min: 100 },
      ],
    };
    const v = evaluateUnlock(STATS, rule);
    expect(v.unlocked).toBe(true);
    expect(v.missing).toEqual([]);

    const missing = evaluateUnlock(STATS, {
      op: "and",
      rules: [{ type: "gamesCompleted", gameSlugs: ["word-ninja", "x"] }],
    });
    expect(missing.unlocked).toBe(false);
    expect(missing.missing.join(",")).toMatch(/word-ninja/);
  });
});

describe("badge criteria", () => {
  const attempt = { accuracy: 96, effectiveWpm: 42, incorrectChars: 0, isFirstCompletion: true };
  const lifetime = { streakDays: 7, totalWords: 1200, gamesCompleted: 3, zeroErrorRuns: 2 };

  it("matches attempt-scoped criteria", () => {
    expect(badgeEarned({ kind: "first_completion" }, attempt, lifetime)).toBe(true);
    expect(badgeEarned({ kind: "accuracy_min", min: 95 }, attempt, lifetime)).toBe(true);
    expect(badgeEarned({ kind: "accuracy_min", min: 99 }, attempt, lifetime)).toBe(false);
    expect(badgeEarned({ kind: "wpm_min", min: 40 }, attempt, lifetime)).toBe(true);
  });

  it("matches lifetime criteria", () => {
    expect(badgeEarned({ kind: "streak_days", min: 7 }, attempt, lifetime)).toBe(true);
    expect(badgeEarned({ kind: "words_total", min: 1000 }, attempt, lifetime)).toBe(true);
    expect(badgeEarned({ kind: "games_completed", min: 5 }, attempt, lifetime)).toBe(false);
    expect(badgeEarned({ kind: "zero_error_runs", min: 2 }, attempt, lifetime)).toBe(true);
  });
});

describe("achievements", () => {
  const stats = {
    totalChars: 5000,
    totalWords: 900,
    attempts: 25,
    bestWpm: 45,
    bestAccuracy: 96,
    streakBest: 8,
  };

  it("reaches crossed thresholds only", () => {
    expect(achievementReached({ slug: "a", metric: "total_chars", threshold: 1000 }, stats)).toBe(true);
    expect(achievementReached({ slug: "a", metric: "total_words", threshold: 1000 }, stats)).toBe(false);
    expect(achievementReached({ slug: "a", metric: "attempts", threshold: 25 }, stats)).toBe(true);
    expect(achievementReached({ slug: "a", metric: "best_wpm", threshold: 60 }, stats)).toBe(false);
    expect(achievementReached({ slug: "a", metric: "best_accuracy", threshold: 95 }, stats)).toBe(true);
    expect(achievementReached({ slug: "a", metric: "streak_best", threshold: 7 }, stats)).toBe(true);
  });
});

describe("personal records", () => {
  it("moves forward only, ties keep the incumbent", () => {
    expect(isRecordBroken("best_wpm", 40, null)).toBe(true);
    expect(isRecordBroken("best_wpm", 41, 40)).toBe(true);
    expect(isRecordBroken("best_wpm", 40, 40)).toBe(false);
    expect(isRecordBroken("best_wpm", 39, 40)).toBe(false);
    expect(isRecordBroken("best_accuracy", 96, 95)).toBe(true);
    expect(isRecordBroken("fastest_ms", 900, 1000)).toBe(true);
    expect(isRecordBroken("fastest_ms", 1000, 1000)).toBe(false);
    expect(isRecordBroken("fastest_ms", 0, 1000)).toBe(false);
    expect(isRecordBroken("most_chars", 500, 400)).toBe(true);
  });
});
