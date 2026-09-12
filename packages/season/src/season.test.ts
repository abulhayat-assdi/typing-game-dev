import { describe, expect, it } from "vitest";
import { canTransitionSeasonStatus, validateSeasonDefinition } from "./definition";
import { aggregatePoints, rankBoard, tierFor } from "./scoring";
import type { PointEvent } from "./types";

const TIERS = [
  { tier: "Gold", minPoints: 200 },
  { tier: "Silver", minPoints: 100 },
  { tier: "Bronze", minPoints: 0 },
];

const ev = (
  participantId: string,
  points: number,
  at = 1000,
  type: "student" | "clan" = "student",
): PointEvent => ({
  source: "COMPETITION",
  participantType: type,
  participantId,
  points,
  occurredAtMs: at,
});

describe("validateSeasonDefinition", () => {
  it("accepts a valid definition", () => {
    expect(
      validateSeasonDefinition({
        slug: "s1",
        name: "Season One",
        startAt: "2026-10-01T00:00:00Z",
        endAt: "2026-12-31T00:00:00Z",
        tiers: TIERS,
      }).ok,
    ).toBe(true);
  });

  it("rejects malformed input", () => {
    const r = validateSeasonDefinition({
      slug: "BAD",
      name: "",
      startAt: "2026-12-31T00:00:00Z",
      endAt: "2026-10-01T00:00:00Z",
      tiers: [
        { tier: "Gold", minPoints: -1 },
        { tier: "Gold", minPoints: 10 },
      ],
    });
    expect(r.errors).toContain("MALFORMED_SLUG");
    expect(r.errors).toContain("MALFORMED_NAME");
    expect(r.errors).toContain("INVALID_WINDOW");
    expect(r.errors).toContain("INVALID_TIER_POINTS");
    expect(r.errors).toContain("DUPLICATE_TIER");
  });

  it("maps the lifecycle", () => {
    expect(canTransitionSeasonStatus("draft", "scheduled")).toBe(true);
    expect(canTransitionSeasonStatus("active", "processing")).toBe(true);
    expect(canTransitionSeasonStatus("processing", "finalized")).toBe(true);
    expect(canTransitionSeasonStatus("active", "finalized")).toBe(false);
    expect(canTransitionSeasonStatus("finalized", "cancelled")).toBe(false);
  });
});

describe("scoring", () => {
  it("aggregates per type and ignores non-positive events", () => {
    const totals = aggregatePoints(
      [ev("u1", 100), ev("u1", 50), ev("u1", 0), ev("u2", 60, 1000, "clan")],
      "student",
    );
    expect(totals.get("u1")).toEqual({ points: 150, firstAtMs: 1000 });
    expect(totals.has("u2")).toBe(false);
  });

  it("ranks deterministically with earliest-event tie-breaks", () => {
    const board = rankBoard(
      [ev("u1", 100, 2000), ev("u2", 100, 1000)],
      "student",
      { u1: "One", u2: "Two" },
      TIERS,
    );
    expect(board.map((r) => r.participantId)).toEqual(["u2", "u1"]);
    expect(board[0]).toMatchObject({ rank: 1, points: 100, tier: "Silver" });
  });

  it("resolves tiers with rank gates", () => {
    expect(tierFor(TIERS, 250, 1)).toBe("Gold");
    expect(tierFor(TIERS, 150, 5)).toBe("Silver");
    expect(tierFor(TIERS, 10, 9)).toBe("Bronze");
    expect(
      tierFor([{ tier: "Elite", minPoints: 0, minRank: 3 }], 10, 9),
    ).toBeNull();
    expect(tierFor([], 10, 1)).toBeNull();
  });

  it("keeps student and clan boards separate", () => {
    const events = [ev("u1", 100), ev("c1", 500, 1000, "clan")];
    expect(rankBoard(events, "student", {}, TIERS)).toHaveLength(1);
    expect(rankBoard(events, "clan", {}, TIERS)[0]).toMatchObject({
      participantId: "c1",
      points: 500,
    });
  });
});
