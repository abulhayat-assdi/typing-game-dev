/**
 * Data-driven damage (M12). Never raw XP, never client numbers — inputs
 * are server-computed M4 result metrics. Mirrors fn_boss_damage_for.
 */
import type { AttemptMetrics, DamageProfile } from "./types";

export const DEFAULT_DAMAGE_PROFILE: DamageProfile = {
  formula: "score_x_mult",
  multiplier: 1,
};

export function damageFor(
  profile: DamageProfile,
  metrics: AttemptMetrics,
  phaseMultiplier = 1,
): number {
  const mult =
    Number.isFinite(profile.multiplier) && profile.multiplier > 0
      ? profile.multiplier
      : 1;
  const accFactor =
    Number.isFinite(profile.accuracyFactor ?? NaN) &&
    (profile.accuracyFactor ?? 0) > 0
      ? (profile.accuracyFactor as number)
      : 1;
  const phase =
    Number.isFinite(phaseMultiplier) && phaseMultiplier > 0
      ? phaseMultiplier
      : 1;
  let base = 0;
  if (profile.formula === "wpm_x_acc") {
    base = metrics.effectiveWpm * (metrics.accuracy / 100) * mult * accFactor;
  } else {
    base = metrics.score * mult;
  }
  if (!Number.isFinite(base) || base < 0) return 0;
  return Math.floor(base * phase);
}

export function validateDamageProfile(
  raw: unknown,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["MALFORMED"] };
  }
  const r = raw as Record<string, unknown>;
  if (r.formula !== "score_x_mult" && r.formula !== "wpm_x_acc") {
    errors.push("UNKNOWN_FORMULA");
  }
  if (typeof r.multiplier !== "number" || !(r.multiplier > 0)) {
    errors.push("INVALID_MULTIPLIER");
  }
  return { ok: errors.length === 0, errors };
}
