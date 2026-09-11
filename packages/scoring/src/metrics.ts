/**
 * Raw typing metrics (M4). Pure derivation from attempt evidence — no rewards,
 * no database, no clock reads. All functions are total (zero-guarded) and
 * deterministic: identical inputs always produce identical outputs.
 *
 * Formulas (spec):
 *   WPM      = (correct_characters / 5) / minutes
 *   accuracy = correct_characters / total_typed_characters * 100
 */
export interface RawMetricsInput {
  correctChars: number;
  typedLength: number;
  errorStrokes?: number;
  corrections?: number;
  elapsedMs: number;
  completedWords?: number;
  expectedLength?: number;
}

export interface RawMetrics {
  durationMs: number;
  totalCharacters: number;
  correctCharacters: number;
  incorrectCharacters: number;
  correctedCharacters: number;
  /** Wrong keystrokes including later-corrected ones (pressure signal). */
  errorStrokes: number;
  completedWords: number;
  accuracy: number;
  rawWpm: number;
  effectiveWpm: number;
  /** 0..100, capped. */
  completion: number;
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function computeRawMetrics(input: RawMetricsInput): RawMetrics {
  const typed = clampInt(input.typedLength);
  const correct = Math.min(clampInt(input.correctChars), typed);
  const incorrect = typed - correct;
  const corrected = Math.min(clampInt(input.corrections ?? 0), typed);
  const errorStrokes = Math.max(clampInt(input.errorStrokes ?? 0), incorrect);
  const durationMs = Number.isFinite(input.elapsedMs)
    ? Math.max(0, input.elapsedMs)
    : 0;
  const minutes = durationMs / 60000;

  const accuracy = typed === 0 ? 0 : (correct / typed) * 100;
  const rawWpm = minutes <= 0 ? 0 : typed / 5 / minutes;
  const effectiveWpm = minutes <= 0 ? 0 : correct / 5 / minutes;
  const expected = input.expectedLength ?? 0;
  const completion =
    expected <= 0 ? 0 : Math.min(100, (typed / expected) * 100);

  return {
    durationMs,
    totalCharacters: typed,
    correctCharacters: correct,
    incorrectCharacters: incorrect,
    correctedCharacters: corrected,
    errorStrokes,
    completedWords: clampInt(input.completedWords ?? 0),
    accuracy,
    rawWpm,
    effectiveWpm,
    completion,
  };
}
