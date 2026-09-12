import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import { createMemoryAdaptiveStore } from "../../../lib/server/adaptive-store";
import {
  buildPracticePlan,
  handleFeedback,
  handleGetSummary,
  handlePracticePlan,
  handleRefresh,
} from "./_helper";
import {
  handleBatchSummary,
  handleGlobalSummary,
} from "../admin/adaptive/_helper";

const session = { userId: "u-1", email: "u@example.com" };

const teacher: Actor = {
  userId: "t-1",
  email: "t@example.com",
  roles: ["teacher"],
  adminOrgIds: [],
  status: "active",
};

const admin: Actor = {
  userId: "a-1",
  email: "a@example.com",
  roles: ["admin"],
  adminOrgIds: [],
  status: "active",
};

const student: Actor = {
  userId: "s-1",
  email: "s@example.com",
  roles: ["student"],
  adminOrgIds: [],
  status: "active",
};

const REC_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const BATCH_ID = "bbbbbbbb-0000-4000-8000-000000000001";

describe("student adaptive endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    const store = createMemoryAdaptiveStore();
    expect((await handleGetSummary({ session: null, store })).status).toBe(401);
    expect((await handleGetSummary({ session, store: null })).status).toBe(503);
    expect((await handleRefresh({ session: null, store })).status).toBe(401);
    expect((await handlePracticePlan({ session, store: null })).status).toBe(503);
  });

  it("validates feedback bodies", async () => {
    const store = createMemoryAdaptiveStore();
    const deps = { session, store };
    expect((await handleFeedback({}, deps)).status).toBe(400);
    expect((await handleFeedback({ recommendationId: "nope", event: "started" }, deps)).status).toBe(400);
    expect(
      (await handleFeedback({ recommendationId: REC_ID, event: "hacked" }, deps)).status,
    ).toBe(400);
    const missing = await handleFeedback(
      { recommendationId: REC_ID, event: "started" },
      deps,
    );
    expect(missing.status).toBe(404);
  });

  it("learns a weak key and plans practice", async () => {
    const store = createMemoryAdaptiveStore();
    const deps = { session, store };
    await store.recordAttempt({
      attemptId: "attempt-1",
      keys: [
        { key: "p", exposures: 10, errors: 4 },
        { key: "a", exposures: 10, errors: 0 },
      ],
      pairs: [{ expected: "p", actual: "o", count: 2 }],
    });
    const refreshed = await handleRefresh(deps);
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject({
      result: { recommendations: 1 },
    });
    const summary = (await (await handleGetSummary(deps)).json()) as {
      summary: {
        weaknesses: { target: string }[];
        recommendations: { reason: string; message: string }[];
      };
    };
    expect(summary.summary.weaknesses.map((w) => w.target)).toContain("p");
    expect(summary.summary.recommendations[0]?.reason).toBe("WEAK_KEY");
    expect(summary.summary.recommendations[0]?.message).toContain("practice");

    const plan = (await (await handlePracticePlan(deps)).json()) as {
      plan: {
        top: { gameSlug: string } | null;
        drill: { items: string[] } | null;
        actions: { key: string }[];
      };
    };
    expect(plan.plan.top?.gameSlug).toBe("word-builder");
    expect(plan.plan.actions.map((a) => a.key)).toEqual([
      "need-most",
      "weak-keys",
      "accuracy",
      "speed",
      "sentences",
    ]);

    const recs = (await store.getSummary())?.recommendations ?? [];
    const recId = recs[0]?.id ?? "";
    expect(recId.length).toBeGreaterThan(0);
    expect(
      (
        await handleFeedback(
          { recommendationId: recId, event: "started" },
          deps,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleFeedback(
          { recommendationId: recId, event: "bogus" },
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it("builds practice drills from content-engine lists", () => {
    const plan = buildPracticePlan({
      band: "beginner",
      evidence: 3,
      dimensions: [],
      trends: [],
      weaknesses: [
        { type: "key", target: "p", promptKind: "words", score: 0.2, confidence: 0.8, trend: "stable" },
      ],
      recommendations: [
        {
          id: REC_ID,
          rank: 1,
          gameSlug: "word-builder",
          difficulty: "beginner",
          missionId: null,
          reason: "WEAK_KEY",
          message: "p needs a little more practice.",
          benefit: "Targeted play, about 5 minutes.",
          confidence: 0.8,
          targets: ["p"],
          drillWords: [],
        },
      ],
      difficulty: [],
    });
    expect(plan.drill).not.toBeNull();
    expect(plan.drill?.items.every((w) => w.toLowerCase().includes("p"))).toBe(true);
  });
});

describe("staff adaptive endpoints", () => {
  it("gates batch and global summaries by role", async () => {
    const store = createMemoryAdaptiveStore();
    expect(
      (await handleBatchSummary(BATCH_ID, { actor: student, store })).status,
    ).toBe(403);
    expect(
      (await handleGlobalSummary({ actor: student, store })).status,
    ).toBe(403);
    expect(
      (await handleGlobalSummary({ actor: teacher, store })).status,
    ).toBe(403);
    expect(
      (await handleBatchSummary("nope", { actor: teacher, store })).status,
    ).toBe(404);
    expect(
      (await handleBatchSummary(BATCH_ID, { actor: teacher, store })).status,
    ).toBe(200);
    expect((await handleGlobalSummary({ actor: admin, store })).status).toBe(200);
  });
});
