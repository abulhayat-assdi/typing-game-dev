/**
 * Deterministic season scoring (M13): aggregate point events, rank by
 * points → earliest event → participant id, resolve tiers. Mirrors
 * fn_season_leaderboard exactly (including the null-tier case).
 */
import type {
  ParticipantType,
  PointEvent,
  RankedParticipant,
  TierDefinition,
} from "./types";

export function aggregatePoints(
  events: PointEvent[],
  type: ParticipantType,
): Map<string, { points: number; firstAtMs: number }> {
  const totals = new Map<string, { points: number; firstAtMs: number }>();
  for (const e of events) {
    if (e.participantType !== type || e.points <= 0) continue;
    const cur = totals.get(e.participantId) ?? {
      points: 0,
      firstAtMs: e.occurredAtMs,
    };
    cur.points += e.points;
    cur.firstAtMs = Math.min(cur.firstAtMs, e.occurredAtMs);
    totals.set(e.participantId, cur);
  }
  return totals;
}

export function tierFor(
  tiers: TierDefinition[],
  points: number,
  rank: number,
): string | null {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  for (const t of sorted) {
    if (points >= t.minPoints && (t.minRank === undefined || rank <= t.minRank)) {
      return t.tier;
    }
  }
  return null;
}

export function rankBoard(
  events: PointEvent[],
  type: ParticipantType,
  names: Record<string, string>,
  tiers: TierDefinition[],
  limit = 100,
): RankedParticipant[] {
  const totals = aggregatePoints(events, type);
  return [...totals.entries()]
    .map(([participantId, t]) => ({ participantId, ...t }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.firstAtMs - b.firstAtMs ||
        (a.participantId < b.participantId ? -1 : 1),
    )
    .slice(0, Math.max(limit, 1))
    .map((e, i) => {
      const rank = i + 1;
      return {
        participantId: e.participantId,
        displayName: names[e.participantId] ?? "Player",
        points: e.points,
        rank,
        tier: tierFor(tiers, e.points, rank),
        firstAtMs: e.firstAtMs,
      };
    });
}
