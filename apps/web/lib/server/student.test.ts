import { describe, expect, it } from "vitest";
import {
  createMemoryStudentStore,
  type LeaderboardRow,
} from "./student-store";
import {
  getBatchLeaderboard,
  getProgressData,
  getStudentDashboard,
  getStudentProfile,
  recommendGame,
  toPublicProfile,
} from "./student";

const U1 = "user-1";

function richStore() {
  return createMemoryStudentStore({
    profiles: {
      [U1]: {
        userId: U1,
        email: "u1@example.com",
        fullName: "User One",
        xpTotal: 120,
        coinBalance: 9,
        level: 3,
        timezone: "Asia/Dhaka",
      },
    },
    memberships: {
      [U1]: {
        batchId: "batch-1",
        batchName: "Batch 101",
        courseName: "Sales",
        rollNumber: "R-01",
        skillTrack: "beginner",
      },
    },
    streaks: { [U1]: { current: 4, best: 9, activeDays: 12 } },
    levels: {
      3: { level: 3, requiredXp: 80, titleEn: "Learner" },
      4: { level: 4, requiredXp: 150, titleEn: "Typer" },
    },
    worlds: [
      {
        slug: "w1",
        order: 1,
        nameEn: "W1",
        nameBn: "W1",
        descriptionEn: "",
        descriptionBn: "",
      },
    ],
    games: [
      {
        slug: "g-a",
        worldSlug: "w1",
        category: "letter",
        mechanic: "target-press",
        mode: "letter",
        difficulty: "beginner",
        timingKind: "untimed",
        timingLimitSeconds: null,
        titleEn: "A",
        titleBn: "A",
        descriptionEn: "A",
      },
      {
        slug: "g-b",
        worldSlug: "w1",
        category: "word",
        mechanic: "time-trial",
        mode: "word",
        difficulty: "intermediate",
        timingKind: "countdown",
        timingLimitSeconds: 60,
        titleEn: "B",
        titleBn: "B",
        descriptionEn: "B",
      },
    ],
    awards: {
      [U1]: [
        {
          badgeSlug: "first-key",
          nameEn: "First Key",
          iconKey: "badges/first-key/icon.webp",
          awardedAt: "2026-01-02T00:00:00Z",
        },
      ],
    },
    achievementAwards: {
      [U1]: [{ slug: "chars-1k", nameEn: "1K", value: 1500, awardedAt: "2026-01-02" }],
    },
    records: [
      {
        userId: U1,
        gameSlug: "g-a",
        metric: "best_score",
        value: 88,
        attemptId: "a1",
      },
    ],
    attempts: [
      {
        userId: U1,
        id: "a1",
        gameSlug: "g-a",
        status: "validated",
        score: 88,
        accuracy: 96,
        createdAt: "2026-01-02T00:00:00Z",
      },
    ],
    unlocks: { [U1]: ["g-a", "g-b"] },
    completed: { [U1]: ["g-a"] },
    aggregates: {
      [U1]: { count: 3, avgWpm: 24, avgAccuracy: 93, bestWpm: 30, bestAccuracy: 96 },
    },
    xpHistory: {
      [U1]: [{ amount: 55, reason: "validated completion", createdAt: "2026-01-02" }],
    },
    streakEvents: { [U1]: ["2026-01-02", "2026-01-01"] },
    boards: {
      "batch-1:all": [
        {
          rank: 1,
          userId: U1,
          fullName: "User One",
          rollNumber: "R-01",
          level: 3,
          xpTotal: 120,
          xpWindow: 40,
          attempts: 2,
          avgWpm: 24,
          avgAccuracy: 93,
          streak: 4,
          badges: ["first-key"],
        },
        {
          rank: 2,
          userId: "user-2",
          fullName: "User Two",
          rollNumber: "R-02",
          level: 2,
          xpTotal: 60,
          xpWindow: 10,
          attempts: 1,
          avgWpm: 15,
          avgAccuracy: 88,
          streak: 1,
          badges: [],
        },
      ] as LeaderboardRow[],
    },
  });
}

describe("getStudentDashboard", () => {
  it("assembles server state without computing economy", async () => {
    const d = await getStudentDashboard(U1, richStore());
    expect(d?.profile.xpTotal).toBe(120);
    expect(d?.levelTitle).toBe("Learner");
    expect(d?.xpToNext).toBe(30);
    expect(d?.streak).toEqual({ current: 4, best: 9 });
    expect(d?.latestBadge?.slug).toBe("first-key");
    expect(d?.rank).toEqual({ rank: 1, total: 2 });
    expect(d?.recommended?.slug).toBe("g-b");
    expect(d?.isNew).toBe(false);
  });

  it("returns null without a profile and flags new users", async () => {
    expect(await getStudentDashboard("ghost", richStore())).toBeNull();
    const empty = createMemoryStudentStore({
      profiles: {
        [U1]: {
          userId: U1,
          email: "e",
          fullName: "N",
          xpTotal: 0,
          coinBalance: 0,
          level: 1,
          timezone: "UTC",
        },
      },
    });
    const d = await getStudentDashboard(U1, empty);
    expect(d?.isNew).toBe(true);
    expect(d?.latestBadge).toBeNull();
    expect(d?.rank).toBeNull();
    expect(d?.xpToNext).toBeNull();
  });
});

describe("recommendGame", () => {
  const games = [
    { slug: "a", worldSlug: "w" },
    { slug: "b", worldSlug: "w" },
  ];
  it("picks unlocked-but-incomplete first", () => {
    expect(recommendGame(games, ["a", "b"], ["a"])).toEqual({
      slug: "b",
      worldSlug: "w",
    });
  });
  it("falls back to earliest incomplete, then null", () => {
    expect(recommendGame(games, [], [])).toEqual({ slug: "a", worldSlug: "w" });
    expect(recommendGame(games, ["a", "b"], ["a", "b"])).toBeNull();
    expect(recommendGame([], [], [])).toBeNull();
  });
});

describe("profile + publicity boundary", () => {
  it("returns full own data including private fields", async () => {
    const p = await getStudentProfile(U1, richStore());
    expect(p?.email).toBe("u1@example.com");
    expect(p?.coins).toBe(9);
    expect(p?.rollNumber).toBe("R-01");
    expect(p?.badges).toHaveLength(1);
    expect(p?.records).toHaveLength(1);
    expect(p?.gamesCompleted).toBe(1);
  });

  it("strips private fields for batch-visible projection", async () => {
    const full = await getStudentProfile(U1, richStore());
    if (!full) throw new Error("missing profile");
    const pub = toPublicProfile(full);
    expect(pub).not.toHaveProperty("email");
    expect(pub).not.toHaveProperty("coins");
    expect(pub.fullName).toBe("User One");
  });
});

describe("getProgressData", () => {
  it("aggregates history, achievements and per-world completion", async () => {
    const p = await getProgressData(U1, richStore());
    expect(p?.xpHistory).toHaveLength(1);
    expect(p?.activeDays).toEqual(["2026-01-02", "2026-01-01"]);
    expect(p?.achievements).toHaveLength(1);
    expect(p?.perWorld).toEqual([
      { worldSlug: "w1", total: 2, completed: 1, unlocked: 2 },
    ]);
  });
});

describe("getBatchLeaderboard", () => {
  it("resolves the member batch and passes the window through", async () => {
    const b = await getBatchLeaderboard(U1, richStore(), { window: "week" });
    // memory store keys boards by `${batch}:${window}`; only :all seeded.
    expect(b.batchId).toBe("batch-1");
    expect(b.rows).toHaveLength(0);
    const all = await getBatchLeaderboard(U1, richStore(), {});
    expect(all.rows).toHaveLength(2);
    expect(all.rows[0]?.userId).toBe(U1);
  });

  it("throws BoardAccessError without membership or on store denial", async () => {
    await expect(
      getBatchLeaderboard("ghost", richStore(), {}),
    ).rejects.toThrow("BOARD_FORBIDDEN");
    const errStore = createMemoryStudentStore({
      profiles: {
        [U1]: {
          userId: U1,
          email: "e",
          fullName: "N",
          xpTotal: 0,
          coinBalance: 0,
          level: 1,
          timezone: "UTC",
        },
      },
      memberships: {
        [U1]: {
          batchId: "b",
          batchName: "B",
          courseName: "C",
          rollNumber: "R",
          skillTrack: "beginner",
        },
      },
      boardError: "NOT_MEMBER",
    });
    await expect(getBatchLeaderboard(U1, errStore, {})).rejects.toThrow(
      "BOARD_FORBIDDEN",
    );
  });
});
