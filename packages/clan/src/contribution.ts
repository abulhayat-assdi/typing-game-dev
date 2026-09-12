/**
 * Contribution rules (M10). Clan XP is always derived from member
 * activity — never a stored mutable counter, never 1:1 with personal XP
 * unless configured. Mirrors trg_attempt_clan_contribution.
 */
import type { ContributionRule } from "./types";

export const DEFAULT_CONTRIBUTION_RULE: ContributionRule = {
  pointsPerScore: 10,
  minPoints: 1,
};

export function contributionForScore(
  score: number,
  rule: ContributionRule = DEFAULT_CONTRIBUTION_RULE,
): number {
  if (!Number.isFinite(score) || score < 0) return 0;
  const divisor =
    Number.isFinite(rule.pointsPerScore) && rule.pointsPerScore > 0
      ? rule.pointsPerScore
      : DEFAULT_CONTRIBUTION_RULE.pointsPerScore;
  const floor =
    Number.isFinite(rule.minPoints) && (rule.minPoints ?? 0) > 0
      ? (rule.minPoints as number)
      : 1;
  return Math.max(floor, Math.floor(score / divisor));
}

export function parseContributionRule(
  raw: unknown,
): { ok: boolean; rule: ContributionRule; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, rule: DEFAULT_CONTRIBUTION_RULE, errors: ["MALFORMED"] };
  }
  const r = raw as Record<string, unknown>;
  const pointsPerScore = r.points_per_score;
  if (
    typeof pointsPerScore !== "number" ||
    !Number.isFinite(pointsPerScore) ||
    pointsPerScore <= 0
  ) {
    errors.push("INVALID_POINTS_PER_SCORE");
  }
  return {
    ok: errors.length === 0,
    rule: {
      pointsPerScore:
        typeof pointsPerScore === "number" && pointsPerScore > 0
          ? pointsPerScore
          : DEFAULT_CONTRIBUTION_RULE.pointsPerScore,
    },
    errors,
  };
}
