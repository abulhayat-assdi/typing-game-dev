/**
 * Streak transitions (M5). Pure, deterministic, timezone-agnostic (callers
 * pass activity dates already resolved via timezone.ts). Only qualifying
 * days advance streaks — logins/views never qualify (enforced upstream: the
 * SQL function only calls this path for VALIDATED attempts).
 */
export interface StreakState {
  current: number;
  best: number;
  lastActiveDate: string | null;
}

export type StreakOutcome =
  | { kind: "first-day"; state: StreakState }
  | { kind: "same-day"; state: StreakState }
  | { kind: "continued"; state: StreakState }
  | { kind: "restarted"; state: StreakState };

export function nextStreak(
  prev: StreakState,
  activityYmd: string,
  todayYmd: string,
): StreakOutcome {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityYmd)) {
    throw new Error("activityYmd must be YYYY-MM-DD");
  }
  if (prev.lastActiveDate === null || prev.current <= 0) {
    const state = {
      current: 1,
      best: Math.max(prev.best, 1),
      lastActiveDate: activityYmd,
    };
    return { kind: "first-day", state };
  }
  if (activityYmd === prev.lastActiveDate) {
    return { kind: "same-day", state: { ...prev } };
  }
  if (activityYmd === todayYmd && prev.lastActiveDate < todayYmd) {
    // Consecutive iff yesterday was active; otherwise the streak broke.
    const yesterday = shiftYmd(todayYmd, -1);
    if (prev.lastActiveDate === yesterday) {
      const current = prev.current + 1;
      return {
        kind: "continued",
        state: { current, best: Math.max(prev.best, current), lastActiveDate: activityYmd },
      };
    }
  }
  // Missed day(s), or backdated activity: restart at 1. Backdated activity
  // never rewrites history (audit-safe); it simply doesn't extend.
  const state = {
    current: 1,
    best: Math.max(prev.best, 1),
    lastActiveDate: activityYmd > prev.lastActiveDate ? activityYmd : prev.lastActiveDate,
  };
  return { kind: "restarted", state };
}

function shiftYmd(ymd: string, days: number): string {
  const t = Date.parse(ymd + "T00:00:00Z") + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
