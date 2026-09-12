/**
 * Deterministic tournament seeding (M14).
 *
 * - manual: caller-supplied order is authoritative (1..N by array order).
 * - season_ranking: frozen snapshot rows (points desc, earliest first,
 *   participant id asc) — never live mutable season points.
 * - random: Fisher-Yates driven by a stored 32-bit seed, so the shuffle is
 *   reproducible and auditable from the stored seed value.
 *
 * All three produce the same output for the same input. Future methods
 * (previous-season / clan-war / leaderboard ranking) share the ranked-row
 * shape via rankSnapshotRows.
 */
import type { SeedEntry } from "./types";

export interface RankedSnapshotRow {
  participantId: string;
  points: number;
  firstAtMs: number;
}

export function rankSnapshotRows(rows: RankedSnapshotRow[]): RankedSnapshotRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      a.firstAtMs - b.firstAtMs ||
      (a.participantId < b.participantId
        ? -1
        : a.participantId > b.participantId
          ? 1
          : 0),
  );
}

/** 32-bit mulberry32 PRNG — deterministic per stored seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

export function seedManual(participantIds: readonly string[]): SeedEntry[] {
  const seen = new Set<string>();
  for (const id of participantIds) {
    if (!id || seen.has(id)) return [];
    seen.add(id);
  }
  if (participantIds.length === 0) return [];
  return participantIds.map((participantId, i) => ({
    participantId,
    seed: i + 1,
    source: "manual",
  }));
}

export function seedFromRanking(rows: readonly RankedSnapshotRow[]): SeedEntry[] {
  const ranked = rankSnapshotRows([...rows]);
  const seen = new Set<string>();
  for (const r of ranked) {
    if (!r.participantId || seen.has(r.participantId)) return [];
    seen.add(r.participantId);
  }
  if (ranked.length === 0) return [];
  return ranked.map((r, i) => ({
    participantId: r.participantId,
    seed: i + 1,
    source: "season_ranking",
  }));
}

export function seedRandom(
  participantIds: readonly string[],
  seed: number,
): SeedEntry[] {
  const seen = new Set<string>();
  for (const id of participantIds) {
    if (!id || seen.has(id)) return [];
    seen.add(id);
  }
  if (participantIds.length === 0) return [];
  if (!Number.isInteger(seed)) return [];
  return shuffleWithSeed(participantIds, seed).map((participantId, i) => ({
    participantId,
    seed: i + 1,
    source: `random:${String(seed >>> 0)}`,
  }));
}

/** Validate a candidate seed list: 1..N seeds, unique participants. */
export function validateSeedEntries(entries: readonly SeedEntry[]): string[] {
  const errors: string[] = [];
  if (entries.length === 0) {
    return ["EMPTY_SEED_LIST"];
  }
  const seeds = new Set<number>();
  const ids = new Set<string>();
  for (const e of entries) {
    if (!e.participantId || ids.has(e.participantId)) {
      errors.push("DUPLICATE_PARTICIPANT");
      break;
    }
    ids.add(e.participantId);
    seeds.add(e.seed);
  }
  for (let i = 1; i <= entries.length; i += 1) {
    if (!seeds.has(i)) {
      errors.push("NON_CONTIGUOUS_SEEDS");
      break;
    }
  }
  return errors;
}
