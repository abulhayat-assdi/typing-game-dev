import { describe, expect, it } from "vitest";
import {
  createMemoryStudentStore,
  type StudentStore,
} from "./student-store";
import {
  filterGames,
  getGameDetails,
  getWorldMapData,
  sortGames,
  type EnrichedGame,
} from "./games";

function store(): StudentStore {
  return createMemoryStudentStore({
    profiles: {
      u: {
        userId: "u",
        email: "e",
        fullName: "U",
        xpTotal: 200,
        coinBalance: 0,
        level: 4,
        timezone: "UTC",
      },
    },
    aggregates: {
      u: { count: 4, avgWpm: 28, avgAccuracy: 82, bestWpm: 33, bestAccuracy: 80 },
    },
    unlocks: { u: ["find-the-key", "letter-rain", "word-builder", "word-sprint"] },
    completed: { u: ["find-the-key"] },
    records: [
      { userId: "u", gameSlug: "word-builder", metric: "best_score", value: 77, attemptId: "a" },
    ],
    awards: { u: [] },
    games: [
      {
        slug: "find-the-key", worldSlug: "keyboard-village", category: "keyboard",
        mechanic: "target-press", mode: "letter", difficulty: "beginner",
        timingKind: "untimed", timingLimitSeconds: null,
        titleEn: "Find the Key", titleBn: "", descriptionEn: "",
      },
      {
        slug: "letter-rain", worldSlug: "letter-valley", category: "letter",
        mechanic: "falling-catch", mode: "letter", difficulty: "beginner",
        timingKind: "countdown", timingLimitSeconds: 60,
        titleEn: "Letter Rain", titleBn: "", descriptionEn: "",
      },
      {
        slug: "word-builder", worldSlug: "word-city", category: "word",
        mechanic: "sequence-build", mode: "word", difficulty: "beginner",
        timingKind: "untimed", timingLimitSeconds: null,
        titleEn: "Word Builder", titleBn: "", descriptionEn: "",
      },
      {
        slug: "word-sprint", worldSlug: "word-city", category: "word",
        mechanic: "time-trial", mode: "word", difficulty: "intermediate",
        timingKind: "countdown", timingLimitSeconds: 60,
        titleEn: "Word Sprint", titleBn: "", descriptionEn: "",
      },
    ],
  });
}

const G: EnrichedGame[] = [
  {
    slug: "g-a", worldSlug: "w1", category: "letter", mechanic: "target-press",
    mode: "letter", difficulty: "beginner", timingKind: "untimed",
    timingLimitSeconds: null, titleEn: "A", titleBn: "", descriptionEn: "",
    unlocked: true, lockedReasons: [], completed: true, bestScore: 50,
  },
  {
    slug: "g-b", worldSlug: "w1", category: "word", mechanic: "time-trial",
    mode: "word", difficulty: "intermediate", timingKind: "countdown",
    timingLimitSeconds: 60, titleEn: "B", titleBn: "", descriptionEn: "",
    unlocked: true, lockedReasons: [], completed: false, bestScore: 77,
  },
  {
    slug: "g-c", worldSlug: "w2", category: "word", mechanic: "time-trial",
    mode: "word", difficulty: "expert", timingKind: "countdown",
    timingLimitSeconds: 60, titleEn: "C", titleBn: "", descriptionEn: "",
    unlocked: false, lockedReasons: ["Reach level 9"], completed: false,
    bestScore: null,
  },
];

describe("filterGames", () => {
  it("filters by world, difficulty, mode and status", () => {
    expect(filterGames(G, { world: "w2" }).map((g) => g.slug)).toEqual(["g-c"]);
    expect(filterGames(G, { difficulty: "beginner" }).map((g) => g.slug)).toEqual(["g-a"]);
    expect(filterGames(G, { status: "locked" }).map((g) => g.slug)).toEqual(["g-c"]);
    expect(filterGames(G, { status: "completed" }).map((g) => g.slug)).toEqual(["g-a"]);
    expect(
      filterGames(G, { status: "unlocked" }).map((g) => g.slug),
    ).toEqual(["g-b"]);
  });

  it("searches titles, slugs and categories", () => {
    expect(filterGames(G, { query: "g-b" }).map((g) => g.slug)).toEqual(["g-b"]);
    expect(filterGames(G, { query: "WORD" }).map((g) => g.slug)).toEqual(["g-b", "g-c"]);
    expect(filterGames(G, {}).length).toBe(3);
  });
});

describe("sortGames", () => {
  it("orders recommended first, then unlocked, then difficulty", () => {
    expect(sortGames(G, "recommended", "g-c").map((g) => g.slug)[0]).toBe("g-c");
    expect(sortGames(G, "recommended", null).map((g) => g.slug)).toEqual([
      "g-a",
      "g-b",
      "g-c",
    ]);
  });

  it("sorts by difficulty and personal best", () => {
    expect(sortGames(G, "easiest", null).map((g) => g.slug)).toEqual([
      "g-a",
      "g-b",
      "g-c",
    ]);
    expect(sortGames(G, "best", null).map((g) => g.slug)).toEqual([
      "g-b",
      "g-a",
      "g-c",
    ]);
  });
});

describe("getGameDetails", () => {
  it("returns enriched details with server unlock verdicts", async () => {
    const d = await getGameDetails("u", "word-sprint", store());
    expect(d?.slug).toBe("word-sprint");
    expect(d?.promptUnits).toBeGreaterThan(0);
    expect(d?.scoringProfile).toBe("speed");
    expect(d?.lockedReasons.length).toBeGreaterThan(0);
    expect(d?.unlocked).toBe(false);
  });

  it("marks open catalog games unlocked", async () => {
    const d = await getGameDetails("u", "find-the-key", store());
    expect(d?.unlocked).toBe(true);
    expect(d?.lockedReasons).toEqual([]);
  });

  it("returns null for unknown slugs", async () => {
    await expect(getGameDetails("u", "nope", store())).resolves.toBeNull();
  });
});

describe("getWorldMapData", () => {
  it("orders worlds and derives statuses", async () => {
    const map = await getWorldMapData("u", store(), "word-sprint");
    expect(map[0]?.slug).toBe("keyboard-village");
    expect(map.length).toBe(16);
    const valley = map.find((w) => w.slug === "letter-valley");
    expect(valley?.total).toBeGreaterThan(0);
    const city = map.find((w) => w.slug === "word-city");
    // word-sprint is the recommended game → its world is current.
    expect(city?.status).toBe("current");
    expect(city?.nextGameSlug).toBe("word-sprint");
  });
});
