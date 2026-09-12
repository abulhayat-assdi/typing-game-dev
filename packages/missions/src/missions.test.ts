import { describe, expect, it } from "vitest";
import { validateMissionDefinition } from "./definition";
import { evaluateMissionProgress } from "./evaluator";
import {
  dayKeyInTimezone,
  hashSeed,
  pickDaily,
  weekStartInTimezone,
} from "./rotation";
import type { MissionDefinition, ValidatedActivity } from "./types";

const base: MissionDefinition = {
  slug: "daily-grind",
  title: "Daily Grind",
  category: "DAILY",
  period: "daily",
  objectives: [{ position: 0, kind: "GAMES_COMPLETED", target: { count: 2 } }],
  rewardXp: 30,
  rewardCoins: 3,
};

const act = (over: Partial<ValidatedActivity> = {}): ValidatedActivity => ({
  gameSlug: "type-racer",
  worldId: "forest",
  accuracy: 95,
  effectiveWpm: 40,
  score: 100,
  correctCharacters: 200,
  completedWords: 40,
  incorrectCharacters: 0,
  submittedAt: "2026-09-12T10:00:00Z",
  ...over,
});

describe("validateMissionDefinition", () => {
  it("accepts a valid definition", () => {
    expect(validateMissionDefinition(base)).toEqual({ ok: true, errors: [] });
  });

  it("rejects malformed slugs, titles and empty objectives", () => {
    const r = validateMissionDefinition({
      ...base,
      slug: "BAD SLUG",
      title: "",
      objectives: [],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("MALFORMED_SLUG");
    expect(r.errors).toContain("MALFORMED_TITLE");
    expect(r.errors).toContain("NO_OBJECTIVES");
  });

  it("rejects unknown kinds and bad targets", () => {
    const r = validateMissionDefinition({
      ...base,
      objectives: [
        { position: 0, kind: "NOPE" as never, target: {} },
        { position: 0, kind: "GAMES_COMPLETED", target: {} },
        { position: 1, kind: "ACCURACY_REACHED", target: {} },
      ],
    });
    expect(r.errors).toContain("UNKNOWN_KIND_NOPE");
    expect(r.errors).toContain("DUPLICATE_POSITION");
    expect(r.errors).toContain("MISSING_COUNT_GAMES_COMPLETED");
    expect(r.errors).toContain("MISSING_THRESHOLD_ACCURACY_REACHED");
  });

  it("rejects negative rewards and invalid windows", () => {
    const r = validateMissionDefinition({
      ...base,
      rewardXp: -1,
      startsAt: "2026-09-02T00:00:00Z",
      endsAt: "2026-09-01T00:00:00Z",
    });
    expect(r.errors).toContain("NEGATIVE_REWARD");
    expect(r.errors).toContain("INVALID_WINDOW");
  });
});

describe("evaluateMissionProgress", () => {
  const window = { from: "2026-09-12T00:00:00Z", to: "2026-09-13T00:00:00Z" };

  it("counts games and completes at target", () => {
    const one = evaluateMissionProgress(base.objectives, [act()], window);
    expect(one).toMatchObject({ done: 0, total: 1, completed: false });
    const two = evaluateMissionProgress(
      base.objectives,
      [act(), act()],
      window,
    );
    expect(two.completed).toBe(true);
    expect(two.objectives[0]).toMatchObject({ current: 2, target: 2 });  });

  it("ignores activity outside the window", () => {
    const r = evaluateMissionProgress(
      base.objectives,
      [act({ submittedAt: "2026-09-10T00:00:00Z" })],
      window,
    );
    expect(r.objectives[0]?.current).toBe(0);
  });

  it("evaluates thresholds as max", () => {
    const r = evaluateMissionProgress(
      [{ position: 0, kind: "ACCURACY_REACHED", target: { threshold: 90 } }],
      [act({ accuracy: 82 }), act({ accuracy: 91 })],
      window,
    );
    expect(r.completed).toBe(true);
    expect(r.objectives[0]?.current).toBe(91);
  });

  it("sums characters and counts perfect runs", () => {
    const chars = evaluateMissionProgress(
      [{ position: 0, kind: "CHARS_TYPED", target: { count: 500 } }],
      [act({ correctCharacters: 200 }), act({ correctCharacters: 327 })],
      window,
    );
    expect(chars.completed).toBe(true);
    const perfect = evaluateMissionProgress(
      [{ position: 0, kind: "PERFECT_RUN", target: { count: 2 } }],
      [act({ incorrectCharacters: 3 }), act()],
      window,
    );
    expect(perfect.completed).toBe(false);
    expect(perfect.objectives[0]?.missing).toContain("NEED_1_MORE");
  });

  it("counts distinct games and personal bests", () => {
    const r = evaluateMissionProgress(
      [
        { position: 0, kind: "DISTINCT_GAMES", target: { count: 2 } },
        { position: 1, kind: "PERSONAL_BEST", target: { count: 1 } },
      ],
      [act({ gameSlug: "a" }), act({ gameSlug: "b", isPersonalBest: true })],
      window,
    );
    expect(r).toMatchObject({ done: 2, total: 2, completed: true });
  });

  it("scopes by game and world", () => {
    const r = evaluateMissionProgress(
      [
        {
          position: 0,
          kind: "GAMES_COMPLETED",
          target: { count: 1, games: ["word-builder"], worlds: ["desert"] },
        },
      ],
      [act()],
      window,
    );
    expect(r.completed).toBe(false);
  });
});

describe("rotation", () => {
  const pool: MissionDefinition[] = ["a", "b", "c", "d"].map((slug) => ({
    ...base,
    slug,
  }));

  it("picks a stable set per user and day", () => {
    const first = pickDaily(pool, "u-1", "2026-09-12", 3).map((m) => m.slug);
    const second = pickDaily(pool, "u-1", "2026-09-12", 3).map((m) => m.slug);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
  });

  it("rotates across days and users", () => {
    const big = ["a", "b", "c", "d", "e", "f"].map((slug) => ({
      ...base,
      slug,
    }));
    const a = pickDaily(big, "u-1", "2026-09-12", 3).map((m) => m.slug);
    const b = pickDaily(big, "u-1", "2026-09-13", 3).map((m) => m.slug);
    const c = pickDaily(big, "u-2", "2026-09-12", 3).map((m) => m.slug);
    expect(hashSeed("u-1", "2026-09-12", "a")).toHaveLength(8);
    const same = (x: string[], y: string[]) => x.join(",") === y.join(",");
    expect(same(a, b) && same(a, c)).toBe(false);
  });

  it("never recommends locked games", () => {
    const locked: MissionDefinition = {
      ...base,
      slug: "locked-one",
      gameSlugs: ["locked-game"],
    };
    const picked = pickDaily([locked], "u-1", "2026-09-12", 3, {
      unlockedGameSlugs: ["type-racer"],
      recentAccuracy: null,
      recentWpm: null,
      recentGameSlugs: [],
    });
    expect(picked).toEqual([]);
  });

  it("computes timezone-aware day and week keys", () => {
    // 2026-09-12T01:00Z is still Sep 11 in New York.
    const ms = Date.parse("2026-09-12T01:00:00Z");
    expect(dayKeyInTimezone(ms, "America/New_York")).toBe("2026-09-11");
    expect(dayKeyInTimezone(ms, "UTC")).toBe("2026-09-12");
    // 2026-09-12 is a Saturday; Monday is Sep 7.
    expect(weekStartInTimezone(ms, "UTC")).toBe("2026-09-07");
    expect(weekStartInTimezone(ms, "bogus-zone")).toBe("2026-09-07");
  });
});
