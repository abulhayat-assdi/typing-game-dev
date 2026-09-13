import { describe, expect, it } from "vitest";
import type { Actor } from "../../../../lib/server/staff";
import { createMemoryRewardedStore } from "../../../../lib/server/rewarded-store";
import {
  handleCancel,
  handleCatalog,
  handleComplete,
  handleMySessions,
  handleOffer,
  handleOptIn,
  handleStart,
} from "./_helper";
import {
  handleFunnel,
  handleSetDefinition,
  handleSetFlag,
  handleSetPolicy,
} from "../../admin/rewards/ads/_helper";

const session = { userId: "u-1", email: "u@example.com" };

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

const SID = "00000000-0000-4000-8000-000000000001";

describe("student rewarded-ads endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    const store = createMemoryRewardedStore();
    expect(
      (await handleOffer({ rewardSlug: "retry-token" }, { session: null, store })).status,
    ).toBe(401);
    expect(
      (await handleMySessions({ session, store: null })).status,
    ).toBe(503);
  });

  it("404s opaque ids and validates bodies", async () => {
    const deps = { session, store: createMemoryRewardedStore() };
    expect((await handleOptIn("nope", deps)).status).toBe(404);
    expect((await handleOffer({}, deps)).status).toBe(400);
    expect((await handleOffer({ rewardSlug: "BAD!" }, deps)).status).toBe(400);
    expect(
      (await handleComplete(SID, {}, deps)).status,
    ).toBe(400);
    expect(
      (await handleComplete(SID, { providerReference: "" }, deps)).status,
    ).toBe(400);
  });

  it("runs the full opt-in loop without trusting the browser", async () => {
    const store = createMemoryRewardedStore();
    const deps = { session, store };
    const offered = await handleOffer(
      { placement: "game_fail", rewardSlug: "retry-token" },
      deps,
    );
    expect(offered.status).toBe(201);
    const { sessionId } = (await offered.json()) as { sessionId: string };
    expect((await handleOptIn(sessionId, deps)).status).toBe(200);
    const started = await handleStart(sessionId, deps);
    const { providerReference } = (await started.json()) as {
      providerReference: string;
    };
    expect(providerReference.startsWith("mock:")).toBe(true);
    // A bare completed flag is never accepted (no such field read).
    const forged = await handleComplete(
      sessionId,
      { completed: true },
      deps,
    );
    expect(forged.status).toBe(400);
    const wrong = await handleComplete(
      sessionId,
      { providerReference: "mock:forged" },
      deps,
    );
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toMatchObject({ error: "FORGED" });
    // Fresh session for the genuine path (the forged one parked failed).
    const offered2 = await handleOffer({ rewardSlug: "retry-token" }, deps);
    const { sessionId: sid2 } = (await offered2.json()) as { sessionId: string };
    await handleOptIn(sid2, deps);
    const started2 = await handleStart(sid2, deps);
    const { providerReference: ref2 } = (await started2.json()) as {
      providerReference: string;
    };
    const done = await handleComplete(sid2, { providerReference: ref2 }, deps);
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ ok: true });
    const sessions = (await (await handleMySessions(deps)).json()) as {
      sessions: { status: string }[];
    };
    expect(sessions.sessions.some((s) => s.status === "rewarded")).toBe(true);
  });

  it("rejects arbitrary rewards and serves the catalog", async () => {
    const deps = { session, store: createMemoryRewardedStore() };
    const bad = await handleOffer({ rewardSlug: "cash-prize" }, deps);
    expect(bad.status).toBe(409);
    expect(await bad.json()).toMatchObject({ error: "INVALID_REWARD" });
    const catalog = await handleCatalog(deps);
    expect(await catalog.json()).toMatchObject({
      rewards: [{ slug: "retry-token" }, { slug: "streak-recovery-1d" }],
    });
  });

  it("cancels without penalty", async () => {
    const store = createMemoryRewardedStore();
    const deps = { session, store };
    const offered = await handleOffer({ rewardSlug: "retry-token" }, deps);
    const { sessionId } = (await offered.json()) as { sessionId: string };
    expect((await handleCancel(sessionId, deps)).status).toBe(200);
    expect((await handleCancel(sessionId, deps)).status).toBe(409);
  });
});

describe("admin rewarded-ads endpoints", () => {
  it("rejects non-admins with 403", async () => {
    const store = createMemoryRewardedStore();
    const deps = { actor: student, store };
    expect((await handleSetPolicy({ enabled: true }, deps)).status).toBe(403);
    expect(
      (await handleSetDefinition({ slug: "retry-token", enabled: true }, deps)).status,
    ).toBe(403);
    expect(
      (await handleSetFlag({ key: "REWARDED_ADS_ENABLED", enabled: true }, deps)).status,
    ).toBe(403);
    expect((await handleFunnel(deps)).status).toBe(403);
  });

  it("validates admin bodies and toggles config", async () => {
    const store = createMemoryRewardedStore();
    const deps = { actor: admin, store };
    expect((await handleSetPolicy("nope", deps)).status).toBe(400);
    expect((await handleSetPolicy({}, deps)).status).toBe(200);
    expect(
      (await handleSetDefinition({ slug: "BAD!", enabled: true }, deps)).status,
    ).toBe(400);
    expect(
      (await handleSetDefinition({ slug: "retry-token", enabled: false }, deps)).status,
    ).toBe(200);
    expect(
      (await handleSetFlag({ key: "EVIL", enabled: true }, deps)).status,
    ).toBe(400);
    expect(
      (await handleSetFlag({ key: "REWARDED_ADS_ENABLED", enabled: true }, deps)).status,
    ).toBe(200);
    expect((await handleFunnel(deps)).status).toBe(200);
  });
});
