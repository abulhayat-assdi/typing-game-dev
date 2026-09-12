/**
 * Deterministic war scoring (M11). Same aggregate modes and tie order as
 * fn_finalize_war: total → accuracy → best → participation → earliest.
 * Pure so brackets/seasons can reuse it without touching SQL.
 */
import type {
  ClanWarTotal,
  WarContribution,
  WarRules,
  WarScoringProfile,
} from "./types";

export function playerScore(
  scores: number[],
  wpms: number[],
  accuracies: number[],
  policy: WarScoringProfile["playerPolicy"],
): number {
  if (policy === "sum") return scores.reduce((s, v) => s + v, 0);
  if (policy === "best_wpm") return maxOf(wpms);
  if (policy === "best_accuracy") return maxOf(accuracies);
  return maxOf(scores);
}

function maxOf(values: number[]): number {
  return values.reduce((m, v) => Math.max(m, v), 0);
}

export function clanTotal(
  contributions: WarContribution[],
  profile: WarScoringProfile,
): Omit<ClanWarTotal, "clanId" | "rank" | "isWinner"> {
  const scored = contributions.filter((c) => c.attempts > 0);
  let total = 0;
  if (profile.mode === "top_n") {
    const n = Math.max(profile.topN ?? 3, 1);
    total = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .reduce((s, c) => s + c.score, 0);
  } else if (profile.mode === "average") {
    total =
      scored.length === 0
        ? 0
        : scored.reduce((s, c) => s + c.score, 0) / scored.length;
  } else {
    total = scored.reduce((s, c) => s + c.score, 0);
  }
  const accs = scored
    .map((c) => c.bestAccuracy)
    .filter((a): a is number => typeof a === "number");
  return {
    total,
    avgAccuracy: accs.length === 0 ? 0 : accs.reduce((s, a) => s + a, 0) / accs.length,
    best: maxOf(scored.map((c) => c.score)),
    participants: scored.length,
    earliestMs: scored.reduce<number | null>(
      (m, c) => (m === null || (c.submittedAtMs !== null && c.submittedAtMs < m) ? c.submittedAtMs : m),
      null,
    ),
  };
}

function compareTotals(
  a: Omit<ClanWarTotal, "clanId" | "rank" | "isWinner">,
  b: Omit<ClanWarTotal, "clanId" | "rank" | "isWinner">,
  tieBreakers: string[],
): number {
  for (const key of tieBreakers) {
    let diff = 0;
    if (key === "total") diff = a.total - b.total;
    else if (key === "accuracy") diff = a.avgAccuracy - b.avgAccuracy;
    else if (key === "best") diff = a.best - b.best;
    else if (key === "participation") diff = a.participants - b.participants;
    else if (key === "earliest") {
      if (a.earliestMs === null || b.earliestMs === null) continue;
      diff = b.earliestMs - a.earliestMs;
    }
    if (diff !== 0) return diff > 0 ? -1 : 1;
  }
  return 0;
}

/** Rank exactly two clan aggregates deterministically. */
export function rankClans(
  challengerId: string,
  defenderId: string,
  challenger: Omit<ClanWarTotal, "clanId" | "rank" | "isWinner">,
  defender: Omit<ClanWarTotal, "clanId" | "rank" | "isWinner">,
  rules: WarRules,
): ClanWarTotal[] {
  const order =
    compareTotals(challenger, defender, rules.tieBreakers) <= 0
      ? [
          { clanId: challengerId, ...challenger },
          { clanId: defenderId, ...defender },
        ]
      : [
          { clanId: defenderId, ...defender },
          { clanId: challengerId, ...challenger },
        ];
  return order.map((e, i) => ({ ...e, rank: i + 1, isWinner: i === 0 }));
}
