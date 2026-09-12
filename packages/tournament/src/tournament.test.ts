/**
 * M14 tournament domain tests: definition, transitions, seeding, bracket
 * generation, tie-breaks, advancement. DB-level registration/finalization
 * cases live in supabase/tests/m14_tournament_test.sql.
 */
import { describe, expect, it } from "vitest";
import {
  advancementTarget,
  canTransitionMatchStatus,
  canTransitionTournamentStatus,
  decideWinner,
  generateFirstRound,
  isImplementedFormat,
  nextPowerOfTwo,
  placements,
  planBracket,
  planSingleElimination,
  roundName,
  seedFromRanking,
  seedManual,
  seedRandom,
  validateSeedEntries,
  validateTournamentDefinition,
} from "./index";

const P = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function seeded(
  count: number,
): { participantId: string; seed: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    participantId: P(i + 1),
    seed: i + 1,
  }));
}

describe("validateTournamentDefinition", () => {
  const base = {
    slug: "autumn-cup",
    name: "Autumn Cup",
    format: "single_elimination" as const,
    participantType: "clan" as const,
  };
  it("accepts a valid single-elimination definition", () => {
    expect(validateTournamentDefinition(base).ok).toBe(true);
  });
  it("rejects malformed input", () => {
    const r = validateTournamentDefinition({
      ...base,
      slug: "BAD",
      name: "",
      format: "double_elimination",
      participantType: "batch",
      participantCap: 1,
    });
    expect(r.errors).toContain("MALFORMED_SLUG");
    expect(r.errors).toContain("MALFORMED_NAME");
    expect(r.errors).toContain("FORMAT_NOT_YET_IMPLEMENTED");
    expect(r.errors).toContain("UNSUPPORTED_PARTICIPANT_TYPE");
    expect(r.errors).toContain("INVALID_PARTICIPANT_CAP");
  });
  it("rejects bad windows", () => {
    expect(
      validateTournamentDefinition({
        ...base,
        registrationStart: "2026-12-01T00:00:00Z",
        registrationEnd: "2026-10-01T00:00:00Z",
      }).errors,
    ).toContain("INVALID_REGISTRATION_WINDOW");
    expect(
      validateTournamentDefinition({
        ...base,
        startAt: "2026-12-01T00:00:00Z",
        endAt: "2026-10-01T00:00:00Z",
      }).errors,
    ).toContain("INVALID_WINDOW");
  });
  it("gates unimplemented formats", () => {
    expect(isImplementedFormat("single_elimination")).toBe(true);
    expect(isImplementedFormat("swiss")).toBe(false);
    expect(planBracket("swiss", 8).error).toBe("FORMAT_NOT_YET_IMPLEMENTED");
    expect(
      planBracket("knockout" as import("./types").TournamentFormat, 8).error,
    ).toBe("UNSUPPORTED_FORMAT");
  });
});

describe("lifecycle transitions", () => {
  it("maps the tournament state machine", () => {
    expect(canTransitionTournamentStatus("draft", "registration_open")).toBe(true);
    expect(canTransitionTournamentStatus("registration_open", "registration_closed")).toBe(true);
    expect(canTransitionTournamentStatus("registration_closed", "seeded")).toBe(true);
    expect(canTransitionTournamentStatus("seeded", "live")).toBe(true);
    expect(canTransitionTournamentStatus("live", "processing")).toBe(true);
    expect(canTransitionTournamentStatus("processing", "finalized")).toBe(true);
    expect(canTransitionTournamentStatus("live", "finalized")).toBe(false);
    expect(canTransitionTournamentStatus("finalized", "live")).toBe(false);
    expect(canTransitionTournamentStatus("draft", "live")).toBe(false);
  });
  it("maps the match state machine", () => {
    expect(canTransitionMatchStatus("pending", "ready")).toBe(true);
    expect(canTransitionMatchStatus("ready", "live")).toBe(true);
    expect(canTransitionMatchStatus("live", "processing")).toBe(true);
    expect(canTransitionMatchStatus("processing", "finalized")).toBe(true);
    expect(canTransitionMatchStatus("finalized", "live")).toBe(false);
    expect(canTransitionMatchStatus("bye", "live")).toBe(false);
    expect(canTransitionMatchStatus("pending", "finalized")).toBe(false);
  });
});

describe("seeding", () => {
  it("manual seeding is deterministic by array order", () => {
    const a = seedManual([P(3), P(1), P(2)]);
    expect(a.map((s) => s.seed)).toEqual([1, 2, 3]);
    expect(a[0]?.participantId).toBe(P(3));
    expect(a.every((s) => s.source === "manual")).toBe(true);
  });
  it("ranking seeding sorts by points, earliest, id", () => {
    const rows = seedFromRanking([
      { participantId: P(2), points: 100, firstAtMs: 2000 },
      { participantId: P(1), points: 100, firstAtMs: 1000 },
      { participantId: P(3), points: 50, firstAtMs: 500 },
    ]);
    expect(rows.map((r) => r.participantId)).toEqual([P(1), P(2), P(3)]);
    expect(rows[0]?.source).toBe("season_ranking");
  });
  it("random seeding is reproducible from the stored seed", () => {
    const ids = [P(1), P(2), P(3), P(4), P(5), P(6), P(7), P(8)];
    const a = seedRandom(ids, 42);
    const b = seedRandom(ids, 42);
    const c = seedRandom(ids, 43);
    expect(a).toEqual(b);
    expect(a.map((s) => s.participantId).sort()).toEqual([...ids].sort());
    expect(a).not.toEqual(c);
    expect(a[0]?.source).toBe("random:42");
  });
  it("rejects duplicates and validates contiguity", () => {
    expect(seedManual([P(1), P(1)])).toEqual([]);
    expect(seedRandom([P(1)], 1.5)).toEqual([]);
    expect(
      validateSeedEntries([
        { participantId: P(1), seed: 1, source: "manual" },
        { participantId: P(1), seed: 2, source: "manual" },
      ]),
    ).toContain("DUPLICATE_PARTICIPANT");
    expect(
      validateSeedEntries([
        { participantId: P(1), seed: 1, source: "manual" },
        { participantId: P(2), seed: 3, source: "manual" },
      ]),
    ).toContain("NON_CONTIGUOUS_SEEDS");
    expect(validateSeedEntries([])).toContain("EMPTY_SEED_LIST");
  });
});

describe("bracket generation", () => {
  it("sizes power-of-two fields without byes", () => {
    for (const n of [2, 4, 8]) {
      const r = generateFirstRound(seeded(n));
      expect(r.error).toBeUndefined();
      if (!("slots" in r) || r.error) throw new Error("unreachable");
      expect(r.slots).toHaveLength(n / 2);
      expect(r.slots.every((s) => s.byeTo === null)).toBe(true);
      const seen = new Set(r.slots.flatMap((s) => [s.a?.participantId, s.b?.participantId]));
      expect(seen.size).toBe(n);
    }
    expect(nextPowerOfTwo(8)).toBe(8);
  });
  it("places top seed against bottom seed (8)", () => {
    const r = generateFirstRound(seeded(8));
    if (!("slots" in r) || r.error) throw new Error("unreachable");
    expect(r.slots[0]?.a?.seed).toBe(1);
    expect(r.slots[0]?.b?.seed).toBe(8);
  });
  it("spreads byes to top seeds for non-power-of-two fields", () => {
    const r = generateFirstRound(seeded(6));
    if (!("slots" in r) || r.error) throw new Error("unreachable");
    expect(r.slots).toHaveLength(4);
    const byes = r.slots.filter((s) => s.byeTo !== null);
    expect(byes).toHaveLength(2);
    expect(byes.map((s) => s.byeTo?.seed).sort()).toEqual([1, 2]);
  });
  it("is deterministic for the same input", () => {
    const a = generateFirstRound(seeded(5));
    const b = generateFirstRound([...seeded(5)].reverse());
    expect(a).toEqual(b);
  });
  it("rejects bad fields", () => {
    expect(generateFirstRound(seeded(1)).error).toBe("TOO_FEW_PARTICIPANTS");
    expect(
      generateFirstRound([
        { participantId: P(1), seed: 1 },
        { participantId: P(1), seed: 2 },
      ]).error,
    ).toBe("DUPLICATE_PARTICIPANT");
  });
  it("plans full single-elimination shapes", () => {
    const r = planSingleElimination(8);
    if (!r.plan) throw new Error("unreachable");
    expect(r.plan.rounds).toBe(3);
    expect(r.plan.matchesPerRound).toEqual([4, 2, 1]);
    expect(r.plan.totalMatches).toBe(7);
    expect(r.plan.byes).toBe(0);
    const odd = planSingleElimination(6);
    if (!odd.plan) throw new Error("unreachable");
    expect(odd.plan.byes).toBe(2);
    expect(odd.plan.totalMatches).toBe(7);
    expect(planSingleElimination(1).error).toBe("TOO_FEW_PARTICIPANTS");
    expect(roundName(3, 3)).toBe("Final");
    expect(roundName(1, 3)).toBe("Quarterfinals");
  });
});

describe("match decisions", () => {
  it("primary score decides", () => {
    const d = decideWinner(P(1), P(2), { scoreA: 10, scoreB: 5 });
    expect(d.winnerId).toBe(P(1));
    expect(d.tieBreak).toBeNull();
  });
  it("walks the tie-break chain deterministically", () => {
    const base = { scoreA: 10, scoreB: 10 };
    expect(
      decideWinner(P(1), P(2), { ...base, accuracyA: 99, accuracyB: 90 }).winnerId,
    ).toBe(P(1));
    expect(
      decideWinner(P(1), P(2), {
        ...base,
        accuracyA: 90,
        accuracyB: 90,
        bestA: 5,
        bestB: 9,
      }).tieBreak,
    ).toBe("best");
    expect(
      decideWinner(P(1), P(2), {
        ...base,
        earliestAMs: 1000,
        earliestBMs: 2000,
      }).tieBreak,
    ).toBe("earliest");
    // total fallback: lower id wins, never the frontend
    const d = decideWinner(P(2), P(1), { ...base });
    expect(d.winnerId).toBe(P(1));
    expect(d.tieBreak).toBe("participant_id");
  });
  it("maps single-elim advancement and placements", () => {
    expect(advancementTarget(1, 1)).toEqual({ round: 2, slot: 1 });
    expect(advancementTarget(1, 4)).toEqual({ round: 2, slot: 2 });
    expect(advancementTarget(2, 2)).toEqual({ round: 3, slot: 1 });
    expect(placements(P(1), P(2), [P(4), P(3)])).toEqual([
      { participantId: P(1), placement: 1 },
      { participantId: P(2), placement: 2 },
      { participantId: P(3), placement: 3 },
      { participantId: P(4), placement: 3 },
    ]);
  });
});
