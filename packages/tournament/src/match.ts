/**
 * Match orchestration decisions (M14). Pure functions the SQL layer mirrors:
 * deterministic winner resolution and advancement mapping.
 *
 * Tie order reuses the war/competition family: primary score → accuracy →
 * best performance → participation → earliest qualifying result. The final
 * fallback is participant-id order so the result is always total (the
 * frontend never decides a winner; ties always resolve server-side).
 */
import {
  DEFAULT_TIE_BREAKERS,
  type MatchScoreInput,
  type TieBreakKey,
} from "./types";

export function decideWinner(
  participantA: string,
  participantB: string,
  score: MatchScoreInput,
  tieBreakers: readonly TieBreakKey[] = DEFAULT_TIE_BREAKERS,
): { winnerId: string; loserId: string; tieBreak: string | null } {
  const sA = score.scoreA;
  const sB = score.scoreB;
  if (sA !== sB) {
    return {
      winnerId: sA > sB ? participantA : participantB,
      loserId: sA > sB ? participantB : participantA,
      tieBreak: null,
    };
  }
  for (const key of tieBreakers) {
    if (key === "score") continue;
    let diff = 0;
    if (key === "accuracy") {
      diff = (score.accuracyA ?? 0) - (score.accuracyB ?? 0);
    } else if (key === "best") {
      diff = (score.bestA ?? 0) - (score.bestB ?? 0);
    } else if (key === "participation") {
      diff = (score.participationA ?? 0) - (score.participationB ?? 0);
    } else {
      const a = score.earliestAMs;
      const b = score.earliestBMs;
      if (a == null || b == null) continue;
      diff = b - a;
    }
    if (diff !== 0) {
      return {
        winnerId: diff > 0 ? participantA : participantB,
        loserId: diff > 0 ? participantB : participantA,
        tieBreak: key,
      };
    }
  }
  const winnerId =
    participantA < participantB ? participantA : participantB;
  return {
    winnerId,
    loserId: winnerId === participantA ? participantB : participantA,
    tieBreak: "participant_id",
  };
}

export interface AdvancementTarget {
  round: number;
  slot: number;
}

/**
 * Single-elimination advancement: winners of round-r slots (2k-1, 2k)
 * feed round-(r+1) slot k. Slot 1 of round 1+ feeds from matches 1,2 etc.
 */
export function advancementTarget(
  round: number,
  slot: number,
): AdvancementTarget {
  return { round: round + 1, slot: Math.ceil(slot / 2) };
}

/** Placement from a finalized single-elimination bracket. */
export function placements(
  championId: string,
  runnerUpId: string,
  semifinalLosers: readonly string[],
): { participantId: string; placement: number }[] {
  const out = [
    { participantId: championId, placement: 1 },
    { participantId: runnerUpId, placement: 2 },
  ];
  const tied = [...semifinalLosers].sort();
  for (const id of tied) out.push({ participantId: id, placement: 3 });
  return out;
}
