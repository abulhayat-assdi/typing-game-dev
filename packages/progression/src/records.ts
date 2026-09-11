/**
 * Personal-record comparisons (M5). Records only move forward: a candidate
 * replaces the incumbent strictly when better (ties keep the older attempt —
 * first achiever wins ties, enforced by the SQL upsert).
 */
export type RecordMetric =
  | "best_wpm"
  | "best_accuracy"
  | "best_score"
  | "fastest_ms"
  | "most_chars";

/** True when the candidate beats the incumbent (null incumbent = first ever). */
export function isRecordBroken(
  metric: RecordMetric,
  candidate: number,
  incumbent: number | null,
): boolean {
  if (incumbent === null) return true;
  if (metric === "fastest_ms") return candidate < incumbent && candidate > 0;
  return candidate > incumbent;
}
