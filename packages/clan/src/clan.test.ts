import { describe, expect, it } from "vitest";
import {
  contributionForScore,
  parseContributionRule,
} from "./contribution";
import { checkContribution, validateHelpRequest } from "./help";
import { rankClans, rankRoster, windowStartMs } from "./aggregation";

describe("contributionForScore", () => {
  it("derives points from score with a floor", () => {
    expect(contributionForScore(70)).toBe(7);
    expect(contributionForScore(5)).toBe(1);
    expect(contributionForScore(-3)).toBe(0);
    expect(contributionForScore(100, { pointsPerScore: 25 })).toBe(4);
    expect(contributionForScore(100, { pointsPerScore: 0 })).toBe(10);
  });

  it("validates stored rules", () => {
    expect(parseContributionRule({ points_per_score: 10 }).ok).toBe(true);
    expect(parseContributionRule({ points_per_score: -2 }).errors).toContain(
      "INVALID_POINTS_PER_SCORE",
    );
    expect(parseContributionRule(null).errors).toContain("MALFORMED");
  });
});

describe("help economics", () => {
  it("validates requests and clamps TTL", () => {
    expect(validateHelpRequest({ requested: 30 }).ttlHours).toBe(48);
    expect(validateHelpRequest({ requested: 30, ttlHours: 500 }).ttlHours).toBe(72);
    expect(validateHelpRequest({ requested: 51 }).ok).toBe(false);
    expect(validateHelpRequest({ requested: 0 }).ok).toBe(false);
  });

  const base = {
    request: {
      status: "open",
      expiresAtMs: 2000,
      requested: 30,
      fulfilled: 10,
    },
    isRequester: false,
    isMember: true,
    alreadyContributed: false,
    supporterSpentToday: 0,
    requesterReceivedToday: 0,
    supporterBalance: 100,
    amount: 20,
    nowMs: 1000,
  };

  it("approves a clean contribution with clamping", () => {
    expect(checkContribution(base)).toEqual({ ok: true, code: "OK", granted: 20 });
    expect(checkContribution({ ...base, amount: 50 }).granted).toBe(20);
  });

  it("denies abuse paths", () => {
    expect(checkContribution({ ...base, isRequester: true }).code).toBe("SELF_FULFILL");
    expect(checkContribution({ ...base, isMember: false }).code).toBe("CROSS_CLAN");
    expect(checkContribution({ ...base, alreadyContributed: true }).code).toBe("DUPLICATE");
    expect(
      checkContribution({ ...base, request: { ...base.request, status: "fulfilled" } }).code,
    ).toBe("CLOSED");
    expect(
      checkContribution({ ...base, supporterSpentToday: 95 }).code,
    ).toBe("SUPPORTER_LIMIT");
    expect(
      checkContribution({ ...base, requesterReceivedToday: 45 }).code,
    ).toBe("REQUESTER_LIMIT");
    expect(checkContribution({ ...base, supporterBalance: 5 }).code).toBe(
      "INSUFFICIENT_COINS",
    );
  });
});

describe("aggregation", () => {
  it("ranks clans with windows", () => {
    const monday = Date.parse("2026-09-07T00:00:00Z");
    const events = [
      { clanId: "a", clanName: "A", userId: "u1", points: 10, atMs: monday + 1000 },
      { clanId: "b", clanName: "B", userId: "u2", points: 30, atMs: monday + 2000 },
      { clanId: "a", clanName: "A", userId: "u1", points: 5, atMs: monday - 100000 },
    ];
    const all = rankClans(events, { a: 2, b: 1 }, "all", monday + 5000);
    expect(all.map((e) => e.clanId)).toEqual(["b", "a"]);
    expect(all[0]).toMatchObject({ rank: 1, totalPoints: 30 });
    const weekly = rankClans(events, { a: 2, b: 1 }, "weekly", monday + 5000);
    expect(weekly.find((e) => e.clanId === "a")?.totalPoints).toBe(10);
    expect(windowStartMs("all", monday)).toBeNull();
  });

  it("ranks roster by contribution", () => {
    const rows = rankRoster([
      { userId: "u1", displayName: "B", rollNumber: "1", role: "member", level: 1, xpTotal: 1, contribution: 5, isMe: false },
      { userId: "u2", displayName: "A", rollNumber: "2", role: "member", level: 1, xpTotal: 1, contribution: 5, isMe: true },
    ]);
    expect(rows.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });
});
