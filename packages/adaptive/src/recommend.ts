/**
 * Recommendation engine (M15). Scores candidate games against the
 * learner's weaknesses, then applies diversity (MMR-style fatigue
 * penalty) so the same game is never spammed. Every recommendation
 * carries a machine-readable reason plus positive, mission-like
 * language — never diagnostic negativity.
 */
import {
  ALGO_CONFIG,
  type ReasonCode,
  type RecommendationCandidate,
  type ScoredRecommendation,
} from "./types";

export interface WeaknessSignal {
  target: string;
  kind: "key" | "finger" | "dimension";
  score: number;
  confidence: number;
  trend: "improving" | "stable" | "declining" | "insufficient";
  promptKind: string;
}

export interface ExposureInfo {
  gameSlug: string;
  showsInWindow: number;
}

function trendUrgency(trend: WeaknessSignal["trend"]): number {
  if (trend === "declining") return 1;
  if (trend === "stable") return 0.5;
  if (trend === "insufficient") return 0.4;
  return 0.2;
}

function missionBonus(missionKind: string | null): number {
  if (missionKind === "DAILY") return 1;
  if (missionKind === "WEEKLY") return 0.8;
  if (missionKind) return 0.5;
  return 0;
}

function reasonFor(
  signal: WeaknessSignal,
  candidate: RecommendationCandidate,
): ReasonCode {
  if (candidate.missionKind === "DAILY") return "DAILY_MISSION";
  if (candidate.missionKind === "WEEKLY") return "WEEKLY_CHALLENGE";
  if (signal.kind === "finger") return "WEAK_FINGER";
  if (signal.kind === "dimension" && signal.target === "wpm") return "LOW_WPM";
  if (signal.kind === "dimension" && signal.target === "accuracy") {
    return "LOW_ACCURACY";
  }
  if (signal.trend === "declining") return "DECLINING_TREND";
  if (!candidate.unlocked) return "UNLOCK_PREPARATION";
  return "WEAK_KEY";
}

function describeTargets(targets: string[], kind: string): string {
  if (kind === "finger") {
    return targets
      .map((t) => t.replace(/_/g, " "))
      .join(", ");
  }
  return targets.join(", ");
}

/** Positive, mission-like framing (never "you are bad at X"). */
export function reasonMessage(
  reason: ReasonCode,
  targets: string[],
  kind: string,
): string {
  const who = targets.length > 0 ? describeTargets(targets, kind) : "typing";
  switch (reason) {
    case "WEAK_KEY":
      return `${who} need${targets.length === 1 && kind !== "finger" ? "s" : ""} a little more practice.`;
    case "WEAK_FINGER":
      return `Your ${who} could use a focused drill.`;
    case "LOW_ACCURACY":
      return "Steady accuracy practice will lock in your progress.";
    case "LOW_WPM":
      return "A speed session is ready when you are.";
    case "DECLINING_TREND":
      return "A short refresher will get you back on track.";
    case "UNLOCK_PREPARATION":
      return "Warm up here to unlock your next game.";
    case "DAILY_MISSION":
      return "Today's mission lines up with your practice.";
    case "WEEKLY_CHALLENGE":
      return "This week's challenge fits your current focus.";
    case "PERSONAL_BEST_OPPORTUNITY":
      return "You're close to a personal best — go for it.";
  }
}

function benefitFor(reason: ReasonCode, mechanic: string): string {
  if (reason === "WEAK_KEY" || reason === "WEAK_FINGER") {
    return `Targeted ${mechanic} play, about 5 minutes.`;
  }
  if (reason === "LOW_WPM") return "Builds comfortable speed without pressure.";
  if (reason === "LOW_ACCURACY") return "Locks in clean, confident keystrokes.";
  return "Keeps your streak of improvement going.";
}

export interface ScoreInput {
  signal: WeaknessSignal;
  candidate: RecommendationCandidate;
  exposure: ExposureInfo | null;
}

/** Priority in 0..1 (weights sum to 1; see ALGO_CONFIG). */
export function scoreCandidate(input: ScoreInput): number {
  const w = ALGO_CONFIG.weights;
  const freshness =
    input.exposure === null
      ? 1
      : Math.max(
          0,
          1 - input.exposure.showsInWindow / ALGO_CONFIG.fatigueWindowShows,
        );
  return (
    w.skillGap * input.signal.score +
    w.confidence * input.signal.confidence +
    w.trendUrgency * trendUrgency(input.signal.trend) +
    w.relevance *
      (input.candidate.promptKind === input.signal.promptKind ? 1 : 0.4) +
    w.difficultyFit * input.candidate.difficultyFit +
    w.freshness * freshness +
    w.missionBonus * missionBonus(input.candidate.missionKind) +
    w.unlockReady * (input.candidate.unlocked ? 1 : 0.5)
  );
}

/**
 * Rank candidates for one weakness signal. Inactive or duplicate-spam
 * games are filtered; the rest sort by priority (stable by slug).
 */
export function rankCandidates(
  signal: WeaknessSignal,
  candidates: RecommendationCandidate[],
  exposures: ExposureInfo[],
  difficulty: string,
  limit = 5,
): ScoredRecommendation[] {
  const seen = new Map(exposures.map((e) => [e.gameSlug, e]));
  return candidates
    .filter((c) => c.active)
    .filter((c) => {
      const e = seen.get(c.gameSlug);
      return !e || e.showsInWindow < ALGO_CONFIG.maxGameRepeats;
    })
    .map((c) => {
      const priority = scoreCandidate({ signal, candidate: c, exposure: seen.get(c.gameSlug) ?? null });
      const reason = reasonFor(signal, c);
      return {
        gameSlug: c.gameSlug,
        difficulty,
        missionId: c.missionId,
        reason,
        message: reasonMessage(reason, [signal.target], signal.kind),
        expectedBenefit: benefitFor(reason, c.mechanic),
        confidence: signal.confidence,
        priority,
        targets: [signal.target],
      };
    })
    .sort((a, b) => b.priority - a.priority || (a.gameSlug < b.gameSlug ? -1 : 1))
    .slice(0, Math.max(limit, 1));
}
