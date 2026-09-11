import { describe, expect, it } from "vitest";
import {
  activityDate,
  daysBetween,
  isValidTimezone,
  normalizeTimezone,
} from "./timezone";
import { nextStreak } from "./streak";

describe("timezone", () => {
  it("resolves activity dates per zone (Dhaka day ≠ UTC day)", () => {
    // 2026-03-01T19:30:00Z = 2026-03-02 01:30 in Dhaka (+6), still Mar 1 in UTC.
    expect(activityDate("2026-03-01T19:30:00Z", "Asia/Dhaka")).toBe("2026-03-02");
    expect(activityDate("2026-03-01T19:30:00Z", "UTC")).toBe("2026-03-01");
  });

  it("validates zones and falls back safely", () => {
    expect(isValidTimezone("Asia/Dhaka")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(normalizeTimezone("nope")).toBe("Asia/Dhaka");
    expect(normalizeTimezone("UTC", "UTC")).toBe("UTC");
    expect(() => activityDate("garbage", "UTC")).toThrow();
  });

  it("measures whole-day gaps across DST boundaries", () => {
    // US DST spring forward 2026-03-08: still exactly 2 calendar days.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-03-09", "2026-03-07")).toBe(-2);
    expect(daysBetween("2026-05-01", "2026-05-01")).toBe(0);
  });
});

describe("streak transitions", () => {
  it("starts the first day", () => {
    const r = nextStreak({ current: 0, best: 0, lastActiveDate: null }, "2026-05-01", "2026-05-01");
    expect(r.kind).toBe("first-day");
    expect(r.state).toMatchObject({ current: 1, best: 1, lastActiveDate: "2026-05-01" });
  });

  it("does not advance twice on the same day", () => {
    const r = nextStreak({ current: 3, best: 5, lastActiveDate: "2026-05-01" }, "2026-05-01", "2026-05-01");
    expect(r.kind).toBe("same-day");
    expect(r.state).toMatchObject({ current: 3, best: 5 });
  });

  it("continues on consecutive days and tracks best", () => {
    const r = nextStreak({ current: 2, best: 2, lastActiveDate: "2026-05-01" }, "2026-05-02", "2026-05-02");
    expect(r.kind).toBe("continued");
    expect(r.state).toMatchObject({ current: 3, best: 3, lastActiveDate: "2026-05-02" });
  });

  it("breaks after a missed day, preserving best", () => {
    const r = nextStreak({ current: 4, best: 4, lastActiveDate: "2026-05-01" }, "2026-05-03", "2026-05-03");
    expect(r.kind).toBe("restarted");
    expect(r.state).toMatchObject({ current: 1, best: 4, lastActiveDate: "2026-05-03" });
  });

  it("never rewrites history for backdated activity", () => {
    const r = nextStreak({ current: 2, best: 2, lastActiveDate: "2026-05-05" }, "2026-05-03", "2026-05-05");
    expect(r.kind).toBe("restarted");
    expect(r.state.lastActiveDate).toBe("2026-05-05");
  });

  it("rejects malformed dates", () => {
    expect(() =>
      nextStreak({ current: 0, best: 0, lastActiveDate: null }, "05/01/2026", "2026-05-01"),
    ).toThrow();
  });
});
