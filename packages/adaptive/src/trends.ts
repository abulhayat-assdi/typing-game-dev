/**
 * Skill trends (M15). Recent window vs historical baseline with minimum
 * evidence on both sides — medians (not means) so one anomalous attempt
 * never flips a trend.
 */
import {
  ALGO_CONFIG,
  type TrendResult,
  type TrendSample,
} from "./types";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function trendOf(
  samples: TrendSample[],
  epsilon: number,
  higherIsBetter = true,
): TrendResult {
  const cfg = ALGO_CONFIG;
  const ordered = [...samples].sort((a, b) => a.atMs - b.atMs);
  if (ordered.length < cfg.minTrendEvidence) {
    return {
      direction: "insufficient",
      recent: null,
      baseline: null,
      evidence: ordered.length,
    };
  }
  const recent = ordered.slice(-cfg.trendRecentN);
  const baseline = ordered.slice(0, Math.max(ordered.length - cfg.trendRecentN, 0)).slice(-cfg.trendBaselineN);
  if (
    recent.length < cfg.minTrendEvidence ||
    baseline.length < cfg.minTrendEvidence
  ) {
    return {
      direction: "insufficient",
      recent: null,
      baseline: null,
      evidence: ordered.length,
    };
  }
  const recentMean = median(recent.map((s) => s.value));
  const baselineMean = median(baseline.map((s) => s.value));
  const delta = higherIsBetter
    ? recentMean - baselineMean
    : baselineMean - recentMean;
  if (delta > epsilon) {
    return { direction: "improving", recent: recentMean, baseline: baselineMean, evidence: ordered.length };
  }
  if (delta < -epsilon) {
    return { direction: "declining", recent: recentMean, baseline: baselineMean, evidence: ordered.length };
  }
  return { direction: "stable", recent: recentMean, baseline: baselineMean, evidence: ordered.length };
}

export function accuracyTrend(samples: TrendSample[]): TrendResult {
  return trendOf(samples, ALGO_CONFIG.trendEpsilonAccuracy, true);
}

export function wpmTrend(samples: TrendSample[]): TrendResult {
  return trendOf(samples, ALGO_CONFIG.trendEpsilonWpm, true);
}

export function errorRateTrend(samples: TrendSample[]): TrendResult {
  return trendOf(samples, ALGO_CONFIG.trendEpsilonAccuracy, false);
}
