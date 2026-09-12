import { describe, expect, it } from "vitest";
import {
  acceptsSubmissions,
  allowedNextStatuses,
  canTransitionStatus,
  isTerminalStatus,
} from "./lifecycle";
import { clanTotal, playerScore, rankClans } from "./scoring";
import type { WarContribution, WarRules } from "./types";

const RULES: WarRules = {
  attemptsPerPlayer: 5,
  prepHours: 2,
  battleHours: 2,
  tieBreakers: ["total", "accuracy", "best", "participation", "earliest"],
};

describe("lifecycle", () => {
  it("allows every legal hop", () => {
    expect(canTransitionStatus("draft", "challenge_sent")).toBe(true);
    expect(canTransitionStatus("challenge_sent", "pending_response")).toBe(true);
    expect(canTransitionStatus("pending_response", "accepted")).toBe(true);
    expect(canTransitionStatus("pending_response", "declined")).toBe(true);
    expect(canTransitionStatus("accepted", "preparation")).toBe(true);
    expect(canTransitionStatus("preparation", "live")).toBe(true);
    expect(canTransitionStatus("live", "processing")).toBe(true);
    expect(canTransitionStatus("processing", "finalized")).toBe(true);
    expect(canTransitionStatus("processing", "live")).toBe(true);
  });

  it("rejects illegal hops and marks terminals", () => {
    expect(canTransitionStatus("draft", "live")).toBe(false);
    expect(canTransitionStatus("live", "finalized")).toBe(false);
    expect(canTransitionStatus("finalized", "cancelled")).toBe(false);
    expect(canTransitionStatus("challenge_sent", "accepted")).toBe(false);
    expect(isTerminalStatus("finalized")).toBe(true);
    expect(isTerminalStatus("live")).toBe(false);
    expect(allowedNextStatuses("live")).toEqual(["processing", "cancelled"]);
    expect(acceptsSubmissions("live")).toBe(true);
    expect(acceptsSubmissions("preparation")).toBe(false);
  });
});

describe("scoring", () => {
  const a: WarContribution = {
    userId: "u1",
    clanId: "a",
    score: 70,
    attempts: 2,
    bestWpm: 40,
    bestAccuracy: 95,
    submittedAtMs: 1000,
  };
  const b: WarContribution = {
    userId: "u2",
    clanId: "b",
    score: 65,
    attempts: 1,
    bestWpm: 50,
    bestAccuracy: 90,
    submittedAtMs: 2000,
  };

  it("scores players per policy", () => {
    expect(playerScore([70, 60], [], [], "best_score")).toBe(70);
    expect(playerScore([70, 60], [], [], "sum")).toBe(130);
    expect(playerScore([], [40, 50], [], "best_wpm")).toBe(50);
    expect(playerScore([], [], [90, 95], "best_accuracy")).toBe(95);
  });

  it("aggregates clan totals per mode", () => {
    const sum = clanTotal([a, { ...a, userId: "u3", score: 10 }], {
      mode: "sum",
      playerPolicy: "best_score",
    });
    expect(sum.total).toBe(80);
    const top = clanTotal([a, { ...a, userId: "u3", score: 10 }], {
      mode: "top_n",
      topN: 1,
      playerPolicy: "best_score",
    });
    expect(top.total).toBe(70);
    const avg = clanTotal([a, b], { mode: "average", playerPolicy: "best_score" });
    expect(avg.total).toBe(67.5);
    expect(avg.participants).toBe(2);
  });

  it("ranks deterministically with ties broken", () => {
    const profile = { mode: "sum" as const, playerPolicy: "best_score" as const };
    const ca = clanTotal([a], profile);
    const cb = clanTotal([b], profile);
    const [first, second] = rankClans("a", "b", ca, cb, RULES);
    expect(first?.clanId).toBe("a");
    expect(first?.rank).toBe(1);
    expect(first?.isWinner).toBe(true);
    expect(second?.rank).toBe(2);
  });

  it("breaks exact ties by accuracy then earliest", () => {
    const profile = { mode: "sum" as const, playerPolicy: "best_score" as const };
    const tied = { ...a, score: 65, bestAccuracy: 99, submittedAtMs: 500 };
    const ca = clanTotal([tied], profile);
    const cb = clanTotal([b], profile);
    const [first] = rankClans("a", "b", ca, cb, RULES);
    expect(first?.clanId).toBe("a");
  });
});
