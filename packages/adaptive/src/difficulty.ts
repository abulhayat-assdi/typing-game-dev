/**
 * Adaptive difficulty (M15). Produces a runtime difficulty configuration
 * layered on top of the game definition — the global definition is
 * never modified. Bands follow the practice profile; per-game form
 * nudges the band up or down within safety bounds.
 */
import {
  ALGO_CONFIG,
  type DifficultyDecision,
  type DifficultyTarget,
  type PracticeBand,
} from "./types";

export const BAND_ORDER: PracticeBand[] = ["beginner", "intermediate", "expert"];

export interface BaseDifficultyParams {
  promptMinLen: number;
  promptMaxLen: number;
  targetWpm: number;
  targetAccuracy: number;
}

export interface FormSample {
  accuracy: number;
  wpm: number;
}

/**
 * Decide per-game difficulty from recent form on that game:
 * - promote when accuracy beats target+delta AND wpm beats target
 *   across the whole form window;
 * - demote when accuracy stays under the floor across the window;
 * - otherwise maintain. Clamped to beginner..expert.
 */
export function decideDifficulty(
  band: PracticeBand,
  form: FormSample[],
  target: DifficultyTarget,
  base: BaseDifficultyParams,
): DifficultyDecision {
  const cfg = ALGO_CONFIG;
  const window = form.slice(-cfg.formWindowN);
  let action: DifficultyDecision["action"] = "maintain";
  if (window.length >= cfg.formWindowN) {
    const promotes = window.every(
      (s) =>
        s.accuracy >= target.targetAccuracy + cfg.promoteAccuracyDelta &&
        s.wpm >= target.targetWpm,
    );
    const demotes = window.every(
      (s) => s.accuracy < cfg.demoteAccuracyFloor,
    );
    if (promotes) action = "increase";
    else if (demotes) action = "decrease";
  }
  const idx = BAND_ORDER.indexOf(band);
  const next =
    BAND_ORDER[
      Math.max(0, Math.min(BAND_ORDER.length - 1, idx + (action === "increase" ? 1 : action === "decrease" ? -1 : 0)))
    ] as PracticeBand;
  const step = next === "expert" ? 1.25 : next === "intermediate" ? 1 : 0.8;
  return {
    band: next,
    action,
    promptMinLen: Math.max(1, Math.round(base.promptMinLen * step)),
    promptMaxLen: Math.max(1, Math.round(base.promptMaxLen * step)),
    targetWpm: Math.round(base.targetWpm * step * 10) / 10,
    targetAccuracy: Math.max(50, Math.min(99, base.targetAccuracy)),
  };
}

/** Practice band from overall accuracy + speed (documented cutoffs). */
export function bandFor(accuracy: number | null, wpm: number | null): PracticeBand {
  if (
    accuracy !== null &&
    wpm !== null &&
    (accuracy >= 95 || wpm >= 50) &&
    accuracy >= 90
  ) {
    return "expert";
  }
  if (
    accuracy !== null &&
    wpm !== null &&
    (accuracy >= 85 || wpm >= 25) &&
    accuracy >= 80
  ) {
    return "intermediate";
  }
  return "beginner";
}
