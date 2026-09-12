/**
 * Deterministic rotation + timezone-aware periods (M9). Same daily set all
 * day for a user; rotation seeded by user+date so refreshes are stable.
 * Mirrors the md5(user||day||mission) ordering in fn_assign_daily_missions.
 */
import type { MissionDefinition, SelectionProfile } from "./types";

/** FNV-1a 32-bit hash rendered as 8 hex chars (stable, no crypto needed). */
export function hashSeed(...parts: string[]): string {
  let h = 0x811c9dc5;
  for (const p of parts.join("|")) {
    h ^= p.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Deterministic daily pick: stable order by seed, locked games excluded,
 * skill band preferred (never exclusive — SQL enforces, this previews).
 * Extension point: SelectionProfile feeds future adaptive ordering.
 */
export function pickDaily(
  pool: MissionDefinition[],
  userId: string,
  dayKey: string,
  count: number,
  profile?: SelectionProfile,
): MissionDefinition[] {
  const unlocked = new Set(profile?.unlockedGameSlugs ?? []);
  const eligible = pool.filter((m) => {
    if (!m.gameSlugs || m.gameSlugs.length === 0) return true;
    if (unlocked.size === 0) return true;
    return m.gameSlugs.some((g) => unlocked.has(g));
  });
  const ranked = [...eligible].sort((a, b) => {
    const ha = hashSeed(userId, dayKey, a.slug);
    const hb = hashSeed(userId, dayKey, b.slug);
    if (ha !== hb) return ha < hb ? -1 : 1;
    const pa =
      profile?.skillBand && a.skillBand === profile.skillBand ? 0 : 1;
    const pb =
      profile?.skillBand && b.skillBand === profile.skillBand ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.slug < b.slug ? -1 : 1;
  });
  return ranked.slice(0, Math.max(0, count));
}

/** YYYY-MM-DD in the student's timezone (assignment grain). */
export function dayKeyInTimezone(nowMs: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowMs));
    return parts;
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

/** Monday (YYYY-MM-DD) of the week containing nowMs in the timezone. */
export function weekStartInTimezone(nowMs: number, timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const used: string[] = [];
    for (let back = 0; back < 7; back++) {
      const d = new Date(nowMs - back * 86_400_000);
      const parts = fmt.formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      used.push(`${get("year")}-${get("month")}-${get("day")}`);
      if (get("weekday") === "Mon") {
        return used[used.length - 1] ?? dayKeyInTimezone(nowMs, timeZone);
      }
    }
    return used[used.length - 1] ?? dayKeyInTimezone(nowMs, timeZone);
  } catch {
    const d = new Date(nowMs);
    const monday = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    const shift = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - shift);
    return monday.toISOString().slice(0, 10);
  }
}
