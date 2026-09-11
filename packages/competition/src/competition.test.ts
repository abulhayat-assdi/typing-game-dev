import { describe, expect, it } from "vitest";
import { validateCompetitionDefinition } from "./definition";
import {
  acceptsAttempts,
  acceptsRegistration,
  allowedNextStatuses,
  canTransitionStatus,
  isTerminalStatus,
} from "./lifecycle";
import { evaluateEligibility } from "./eligibility";
import {
  aggregateBatch,
  competitionValue,
  rankEntries,
  selectRepresentative,
} from "./scoring";

function validDef(): Record<string, unknown> {
  return {
    slug: "speed-cup-1",
    title: { en: "Speed Cup" },
    type: "SPEED",
    gameSlugs: ["minute-dash"],
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: "2026-10-02T00:00:00Z",
    registrationStartsAt: "2026-09-20T00:00:00Z",
    registrationEndsAt: "2026-09-30T00:00:00Z",
    attemptLimit: 5,
    scoring: { metric: "wpm" },
    tieBreakers: ["score", "accuracy"],
    attemptPolicy: "BEST_WPM",
    version: 1,
  };
}

describe("validateCompetitionDefinition", () => {
  it("accepts a well-formed definition", () => {
    expect(validateCompetitionDefinition(validDef())).toEqual([]);
  });

  it("rejects bad dates, games, policies and versions", () => {
    expect(
      validateCompetitionDefinition({
        ...validDef(),
        startsAt: "2026-10-02T00:00:00Z",
        endsAt: "2026-10-01T00:00:00Z",
      }),
    ).toMatchObject([expect.stringMatching(/after/)]);
    expect(
      validateCompetitionDefinition({ ...validDef(), gameSlugs: [] }),
    ).not.toEqual([]);
    expect(
      validateCompetitionDefinition({ ...validDef(), attemptPolicy: "MOST_VIBES" }),
    ).not.toEqual([]);
    expect(
      validateCompetitionDefinition({ ...validDef(), scoring: { metric: "luck" } }),
    ).not.toEqual([]);
    expect(validateCompetitionDefinition(null)).not.toEqual([]);
  });
});

describe("lifecycle", () => {
  it("walks draft to finalized", () => {
    for (const [from, to] of [
      ["draft", "scheduled"],
      ["scheduled", "registration_open"],
      ["registration_open", "live"],
      ["live", "ended"],
      ["ended", "processing"],
      ["processing", "finalized"],
    ] as const) {
      expect(canTransitionStatus(from, to)).toBe(true);
    }
  });

  it("rejects illegal jumps and terminal exits", () => {
    expect(canTransitionStatus("draft", "live")).toBe(false);
    expect(canTransitionStatus("finalized", "live")).toBe(false);
    expect(canTransitionStatus("live", "finalized")).toBe(false);
    expect(isTerminalStatus("finalized")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("live")).toBe(false);
    expect(allowedNextStatuses("live")).toContain("ended");
  });

  it("gates registration and attempts by state", () => {
    expect(acceptsRegistration("registration_open")).toBe(true);
    expect(acceptsRegistration("live")).toBe(false);
    expect(acceptsAttempts("live")).toBe(true);
    expect(acceptsAttempts("ended")).toBe(false);
  });
});

describe("evaluateEligibility", () => {
  const player = {
    batchIds: ["b1"],
    courseIds: ["c1"],
    skillBand: "beginner",
    level: 3,
    bestAccuracy: 90,
    bestWpm: 25,
    active: true,
    alreadyRegistered: false,
    nowIso: "2026-09-25T00:00:00Z",
    registrationStartsAt: "2026-09-20T00:00:00Z",
    registrationEndsAt: "2026-09-30T00:00:00Z",
  };
  it("accepts eligible players with no reasons", () => {
    const v = evaluateEligibility({ batches: ["b1"], minLevel: 2 }, player);
    expect(v).toEqual({ eligible: true, reasons: [] });
  });

  it("collects every violated rule with codes", () => {
    const v = evaluateEligibility(
      {
        batches: ["b9"],
        courses: ["c9"],
        skillBands: ["expert"],
        minLevel: 9,
        minAccuracy: 99,
        minWpm: 99,
      },
      player,
    );
    expect(v.eligible).toBe(false);
    expect(v.reasons).toEqual(
      expect.arrayContaining([
        "BATCH_INELIGIBLE",
        "COURSE_INELIGIBLE",
        "SKILL_INELIGIBLE",
        "LEVEL_TOO_LOW",
        "ACCURACY_TOO_LOW",
        "WPM_TOO_LOW",
      ]),
    );
  });

  it("enforces windows, activity and duplicates first", () => {
    expect(
      evaluateEligibility({}, { ...player, active: false }).reasons,
    ).toEqual(["ACCOUNT_INACTIVE"]);
    expect(
      evaluateEligibility({}, { ...player, alreadyRegistered: true }).reasons,
    ).toEqual(["ALREADY_REGISTERED"]);
    expect(
      evaluateEligibility(
        {},
        { ...player, nowIso: "2026-10-01T00:00:00Z" },
      ).reasons,
    ).toEqual(["REGISTRATION_CLOSED"]);
  });
});

describe("competition scoring", () => {
  it("derives metric values including hybrid weights", () => {
    const a = { score: 100, accuracy: 90, wpm: 40 };
    expect(competitionValue(a, { metric: "wpm" })).toBe(40);
    expect(competitionValue(a, { metric: "accuracy" })).toBe(90);
    expect(competitionValue(a, { metric: "score" })).toBe(100);
    expect(
      competitionValue(a, {
        metric: "hybrid",
        wpmWeight: 0.5,
        accuracyWeight: 0.5,
        wpmCap: 80,
      }),
    ).toBeCloseTo(0.5 * 0.5 + 0.9 * 0.5, 5);
  });

  it("selects representatives per attempt policy", () => {
    const attempts = [
      { attemptId: "a1", entryId: "e", userId: "u", batchId: null, score: 10, accuracy: 99, wpm: 10, errors: 0, submittedAt: "2026-01-01T00:00:00Z" },
      { attemptId: "a2", entryId: "e", userId: "u", batchId: null, score: 50, accuracy: 80, wpm: 40, errors: 5, submittedAt: "2026-01-02T00:00:00Z" },
    ];
    const cfg = { metric: "score" as const };
    expect(selectRepresentative(attempts, "BEST_SCORE", cfg)?.attemptId).toBe("a2");
    expect(selectRepresentative(attempts, "BEST_ACCURACY", cfg)?.attemptId).toBe("a1");
    expect(selectRepresentative(attempts, "BEST_WPM", cfg)?.attemptId).toBe("a2");
    expect(selectRepresentative(attempts, "LATEST_VALID", cfg)?.attemptId).toBe("a2");
    const avg = selectRepresentative(attempts, "AVERAGE_TOP_3", cfg);
    expect(avg?.value).toBe((10 + 50) / 2);
    expect(avg?.attemptId).toBe("a2");
    expect(selectRepresentative([], "BEST_SCORE", cfg)).toBeNull();
  });

  it("ranks deterministically with tie-breaks", () => {
    const entries = [
      { entryId: "e1", userId: "u1", batchId: null, value: 100, accuracy: 90, wpm: 30, errors: 2, submittedAt: "2026-01-02T00:00:00Z" },
      { entryId: "e2", userId: "u2", batchId: null, value: 100, accuracy: 95, wpm: 25, errors: 1, submittedAt: "2026-01-03T00:00:00Z" },
      { entryId: "e3", userId: "u3", batchId: null, value: 90, accuracy: 99, wpm: 60, errors: 0, submittedAt: "2026-01-01T00:00:00Z" },
    ];
    const ranked = rankEntries(entries);
    expect(ranked.map((r) => r.entryId)).toEqual(["e2", "e1", "e3"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    // Identical rows still order totally (entry id decides, reproducible).
    const twins = rankEntries([
      { entryId: "x1", userId: "u", batchId: null, value: 50, accuracy: 90, wpm: 20, errors: 1, submittedAt: "2026-01-01T00:00:00Z" },
      { entryId: "x0", userId: "u", batchId: null, value: 50, accuracy: 90, wpm: 20, errors: 1, submittedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(twins.map((r) => r.entryId)).toEqual(["x0", "x1"]);
  });

  it("aggregates batch values per strategy", () => {
    expect(aggregateBatch([10, 20, 30], "SUM")).toBe(60);
    expect(aggregateBatch([10, 20, 30], "AVERAGE")).toBe(20);
    expect(aggregateBatch([10, 20, 30], "TOP_N", 2)).toBe(50);
    expect(aggregateBatch([10, 20, 30], "AVERAGE_TOP_N", 2)).toBe(25);
    expect(aggregateBatch([10, 20, 30], "BEST_PLAYER")).toBe(30);
    expect(aggregateBatch([], "SUM")).toBe(0);
    expect(aggregateBatch([10, 10], "PARTICIPATION_WEIGHTED")).toBeGreaterThan(10);
  });
});
