/**
 * Clan aggregation (M10). Ranks clans and members from contribution
 * events — the same derived-metric family as comp_batch_aggregate, kept
 * generic so batch/clan/future war contexts share one ranking shape.
 */
import type {
  BoardWindow,
  ClanBoardEntry,
  ClanRosterRow,
} from "./types";

export interface ContributionEvent {
  clanId: string;
  clanName: string;
  userId: string;
  points: number;
  atMs: number;
}

export function windowStartMs(window: BoardWindow, nowMs: number): number | null {
  if (window === "all") return null;
  const d = new Date(nowMs);
  if (window === "daily") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.getTime();
}

export function rankClans(
  events: ContributionEvent[],
  membersByClan: Record<string, number>,
  window: BoardWindow,
  nowMs: number,
  limit = 20,
): ClanBoardEntry[] {
  const from = windowStartMs(window, nowMs);
  const totals = new Map<string, { name: string; points: number }>();
  for (const e of events) {
    if (from !== null && e.atMs < from) continue;
    const cur = totals.get(e.clanId) ?? { name: e.clanName, points: 0 };
    cur.points += e.points;
    totals.set(e.clanId, cur);
  }
  return [...totals.entries()]
    .map(([clanId, t]) => ({
      clanId,
      name: t.name,
      memberCount: membersByClan[clanId] ?? 0,
      totalPoints: t.points,
      rank: 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || (a.name < b.name ? -1 : 1))
    .slice(0, Math.max(limit, 1))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

export function rankRoster(
  rows: ClanRosterRow[],
): ClanRosterRow[] {
  return [...rows].sort(
    (a, b) =>
      b.contribution - a.contribution || (a.displayName < b.displayName ? -1 : 1),
  );
}
