/**
 * Deterministic single-elimination bracket generation (M14).
 *
 * Placement uses the canonical seed order ([1,8,4,5,2,7,3,6] for 8 slots),
 * so the same (participants, seeds, config) always yields the same bracket.
 * Non-power-of-two fields are padded with byes; byes spread so top seeds
 * advance automatically. Later rounds reference child matches from round 1.
 *
 * Double elimination / round robin / Swiss expose architecture-ready plan
 * descriptors only (FORMAT_NOT_YET_IMPLEMENTED) — no partial brackets.
 */
import type {
  BracketParticipant,
  BracketSlot,
  TournamentFormat,
} from "./types";

export function nextPowerOfTwo(n: number): number {
  if (!Number.isInteger(n) || n < 1) return 1;
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/** Canonical seed placement order for a power-of-two slot count. */
export function seedPositions(slots: number): number[] {
  let order = [1];
  let size = 1;
  while (size < slots) {
    size *= 2;
    const next: number[] = [];
    for (const p of order) {
      next.push(p, size + 1 - p);
    }
    order = next;
  }
  return order;
}

export function roundCount(participantCount: number): number {
  return Math.log2(nextPowerOfTwo(Math.max(participantCount, 2)));
}

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round of ${String(2 ** (fromEnd + 1))}`;
}

/**
 * Generate first-round slots for single elimination. Returns an error code
 * string on invalid input, otherwise the ordered slot list.
 */
export function generateFirstRound(
  participants: readonly BracketParticipant[],
): { slots: BracketSlot[]; error?: undefined } | { slots: []; error: string } {
  if (participants.length < 2) return { slots: [], error: "TOO_FEW_PARTICIPANTS" };
  const bySeed = [...participants].sort((a, b) => a.seed - b.seed);
  const ids = new Set<string>();
  for (let i = 0; i < bySeed.length; i += 1) {
    const p = bySeed[i] as BracketParticipant;
    if (!p.participantId || ids.has(p.participantId)) {
      return { slots: [], error: "DUPLICATE_PARTICIPANT" };
    }
    ids.add(p.participantId);
    if (p.seed !== i + 1) return { slots: [], error: "NON_CONTIGUOUS_SEEDS" };
  }
  const slots = nextPowerOfTwo(bySeed.length);
  const positions = seedPositions(slots);
  const seedOf = new Map(bySeed.map((p) => [p.seed, p]));
  const placed: (BracketParticipant | null)[] = positions.map(
    (seed) => seedOf.get(seed) ?? null,
  );
  const out: BracketSlot[] = [];
  for (let i = 0; i < placed.length; i += 2) {
    const a = placed[i] ?? null;
    const b = placed[i + 1] ?? null;
    if (!a && !b) return { slots: [], error: "EMPTY_SLOT_PAIR" };
    const byeTo = a && !b ? a : b && !a ? b : null;
    out.push({ round: 1, slot: out.length + 1, a, b, byeTo });
  }
  return { slots: out };
}

export interface BracketPlan {
  format: TournamentFormat;
  rounds: number;
  matchesPerRound: number[];
  totalMatches: number;
  byes: number;
}

/** Full single-elimination plan (all rounds, match counts, byes). */
export function planSingleElimination(
  participantCount: number,
): { plan: BracketPlan; error?: undefined } | { plan: null; error: string } {
  if (!Number.isInteger(participantCount) || participantCount < 2) {
    return { plan: null, error: "TOO_FEW_PARTICIPANTS" };
  }
  const slots = nextPowerOfTwo(participantCount);
  const rounds = Math.log2(slots);
  const matchesPerRound: number[] = [];
  for (let r = 1; r <= rounds; r += 1) {
    matchesPerRound.push(slots / 2 ** r);
  }
  const totalMatches = matchesPerRound.reduce((s, m) => s + m, 0);
  return {
    plan: {
      format: "single_elimination",
      rounds,
      matchesPerRound,
      totalMatches,
      byes: slots - participantCount,
    },
  };
}

/**
 * Architecture-ready plan hook for future formats. Always returns the
 * not-implemented descriptor — roadmapped formats never emit partial
 * brackets that callers could mistake for real ones.
 */
export function planBracket(
  format: TournamentFormat,
  participantCount: number,
): { plan: BracketPlan | null; error: string | null } {
  if (format === "single_elimination") {
    const r = planSingleElimination(participantCount);
    return r.plan ? { plan: r.plan, error: null } : { plan: null, error: r.error };
  }
  const future: readonly string[] = ["double_elimination", "round_robin", "swiss"];
  if (future.includes(format)) {
    return { plan: null, error: "FORMAT_NOT_YET_IMPLEMENTED" };
  }
  return { plan: null, error: "UNSUPPORTED_FORMAT" };
}
