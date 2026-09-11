/**
 * Unlock evaluator (M5). Evaluates GameDefinition unlock rules against a
 * player-stats snapshot and explains WHY locked — the future UI renders
 * `reasons`/`missing` verbatim. Pure: same stats + rule ⇒ same verdict.
 */
import type { UnlockRule } from "@tap/game-engine";

export interface UnlockStats {
  level: number;
  totalXp: number;
  bestAccuracy: number;
  bestWpm: number;
  completedMissions: number;
  completedGames: string[];
  badges: string[];
  worldsCompleted: string[];
}

export interface UnlockVerdict {
  unlocked: boolean;
  reasons: string[];
  missing: string[];
}

function checkLeaf(
  stats: UnlockStats,
  rule: Extract<UnlockRule, { type: string }>,
  verdict: UnlockVerdict,
): boolean {
  switch (rule.type) {
    case "open":
      return true;
    case "level":
      if (stats.level >= rule.min) return true;
      verdict.missing.push(`Reach level ${String(rule.min)}`);
      return false;
    case "xp":
      if (stats.totalXp >= rule.min) return true;
      verdict.missing.push(`Earn ${String(rule.min)} total XP`);
      return false;
    case "accuracy":
      if (stats.bestAccuracy >= rule.min) return true;
      verdict.missing.push(`Reach ${String(rule.min)}% accuracy`);
      return false;
    case "wpm":
      if (stats.bestWpm >= rule.min) return true;
      verdict.missing.push(`Reach ${String(rule.min)} WPM`);
      return false;
    case "missionsCompleted":
      if (stats.completedMissions >= rule.count) return true;
      verdict.missing.push(`Complete ${String(rule.count)} missions`);
      return false;
    case "gamesCompleted": {
      const missing = rule.gameSlugs.filter((s) => !stats.completedGames.includes(s));
      if (missing.length === 0) return true;
      verdict.missing.push(`Complete: ${missing.join(", ")}`);
      return false;
    }
    case "badge":
      if (stats.badges.includes(rule.badgeSlug)) return true;
      verdict.missing.push(`Earn the ${rule.badgeSlug} badge`);
      return false;
    default:
      verdict.missing.push("Unknown requirement");
      return false;
  }
}

function evaluate(
  stats: UnlockStats,
  rule: UnlockRule,
  verdict: UnlockVerdict,
): boolean {
  if ("op" in rule) {
    const results = rule.rules.map((r) => evaluate(stats, r, verdict));
    const before = verdict.missing.length;
    const ok =
      rule.op === "and" ? results.every(Boolean) : results.some(Boolean);
    if (ok) {
      // On success, drop reasons this group added (nothing missing).
      verdict.missing.splice(before);
      verdict.reasons.push(
        rule.op === "and" ? "All requirements met" : "One requirement met",
      );
    }
    return ok;
  }
  const ok = checkLeaf(stats, rule, verdict);
  if (ok) verdict.reasons.push("Requirement met");
  return ok;
}

export function evaluateUnlock(stats: UnlockStats, rule: UnlockRule): UnlockVerdict {
  const verdict: UnlockVerdict = { unlocked: false, reasons: [], missing: [] };
  verdict.unlocked = evaluate(stats, rule, verdict);
  if (verdict.unlocked) verdict.missing = [];
  return verdict;
}
