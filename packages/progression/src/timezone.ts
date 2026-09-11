/**
 * Timezone abstraction (M5). Timestamps stay UTC; a student's *activity date*
 * derives from their configured timezone (default Asia/Dhaka, never assumed
 * by business logic). Workers-safe: built on Intl only.
 */

export const DEFAULT_TIMEZONE = "Asia/Dhaka";

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(tz: unknown, fallback = DEFAULT_TIMEZONE): string {
  return isValidTimezone(tz) ? tz : fallback;
}

function ymdInZone(date: Date, timeZone: string): string {
  // en-CA yields YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar date (YYYY-MM-DD) of a UTC instant in the student's zone. */
export function activityDate(utcIso: string | Date, timeZone: string): string {
  const date = utcIso instanceof Date ? utcIso : new Date(utcIso);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid timestamp");
  return ymdInZone(date, normalizeTimezone(timeZone));
}

/** Whole-day difference between two YYYY-MM-DD dates (b - a). */
export function daysBetween(aYmd: string, bYmd: string): number {
  const ms =
    Date.parse(bYmd + "T00:00:00Z") - Date.parse(aYmd + "T00:00:00Z");
  return Math.round(ms / 86400000);
}
