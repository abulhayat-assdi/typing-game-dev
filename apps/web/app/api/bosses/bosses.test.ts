import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import { createMemoryBossStore } from "../../../lib/server/boss-store";
import {
  handleGetBoss,
  handleListBosses,
  handleSubmitBoss,
} from "./_helper";
import {
  handleActivateInstance,
  handleBossStatus,
  handleCreateBoss,
  handleCreateInstance,
  handleFinalizeInstance,
  handleListBosses as handleAdminList,
} from "../admin/bosses/_helper";

const IID = "00000000-0000-4000-8000-000000000001";

const admin: Actor = {
  userId: "a-1",
  email: "a@example.com",
  roles: ["admin"],
  adminOrgIds: ["org-1"],
  status: "active",
};

const student: Actor = {
  userId: "s-1",
  email: "s@example.com",
  roles: ["student"],
  adminOrgIds: [],
  status: "active",
};

const session = { userId: "s-1", email: "s@example.com" };

function seed() {
  return createMemoryBossStore({
    bosses: [
      {
        def: {
          id: "00000000-0000-4000-8000-000000000009",
          slug: "stone-titan",
          name: "Stone Titan",
          description: "",
          lore: "",
          difficulty: "easy",
          maxHp: 100,
          status: "active",
          version: 1,
        },
        state: {
          instance: {
            id: IID,
            status: "active",
            startAt: "2026-09-12T00:00:00Z",
            endAt: "2026-09-13T00:00:00Z",
            initialHp: 100,
            currentHp: 100,
            currentPhase: 0,
            attemptsPerMember: 10,
            defeatedAt: null,
          },
          boss: {
            slug: "stone-titan",
            name: "Stone Titan",
            lore: "",
            difficulty: "easy",
            maxHp: 100,
            artKey: null,
            rewardXp: 60,
            rewardCoins: 6,
          },
          phases: [
            { position: 0, name: "Shell", hpFrom: 100, hpTo: 0, damageMultiplier: 1 },
          ],
          mine: { damage: 0, attemptsUsed: 0 },
          top: [],
          feed: [],
        },
      },
    ],
  });
}

const createBody = {
  slug: "stone-titan",
  name: "Stone Titan",
  description: "",
  lore: "",
  difficulty: "easy",
  maxHp: 5000,
  phases: [{ name: "Shell", hpFrom: 5000, hpTo: 0, multiplier: 1, rules: {}, games: [] }],
  rewardXp: 60,
  rewardCoins: 6,
};

describe("student boss endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    expect((await handleListBosses({ session: null, store: seed() })).status).toBe(401);
    expect((await handleListBosses({ session, store: null })).status).toBe(503);
  });

  it("404s opaque ids and validates submits", async () => {
    const deps = { session, store: seed() };
    expect((await handleGetBoss("nope", deps)).status).toBe(404);
    const list = await handleListBosses(deps);
    expect(await list.json()).toMatchObject({
      bosses: [{ slug: "stone-titan" }],
      instances: [{ id: IID }],
    });
    const detail = await handleGetBoss(IID, deps);
    expect(await detail.json()).toMatchObject({
      state: { boss: { name: "Stone Titan" } },
    });
    expect((await handleSubmitBoss(IID, {}, deps)).status).toBe(400);
    const ok = await handleSubmitBoss(IID, { attemptId: IID }, deps);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, damage: 10 });
  });
});

describe("admin boss endpoints", () => {
  it("rejects non-admins with 403", async () => {
    const store = seed();
    const deps = { actor: student, store };
    expect((await handleAdminList(deps)).status).toBe(403);
    expect((await handleCreateBoss(createBody, deps)).status).toBe(403);
    expect((await handleBossStatus(IID, "active", deps)).status).toBe(403);
    expect(
      (await handleCreateInstance({ bossId: IID, clanId: IID, startAt: "2026-09-12T00:00:00Z", endAt: "2026-09-13T00:00:00Z" }, deps)).status,
    ).toBe(403);
    expect((await handleActivateInstance(IID, deps)).status).toBe(403);
    expect((await handleFinalizeInstance(IID, deps)).status).toBe(403);
  });

  it("validates creates with 400 then 201s", async () => {
    const store = seed();
    const deps = { actor: admin, store };
    for (const body of [
      {},
      { ...createBody, slug: "BAD" },
      { ...createBody, maxHp: 0 },
      { ...createBody, phases: [] },
      {
        ...createBody,
        phases: [{ name: "x", hpFrom: 10, hpTo: 20, multiplier: 1, rules: {}, games: [] }],
      },
    ]) {
      expect((await handleCreateBoss(body, deps)).status).toBe(400);
    }
    const ok = await handleCreateBoss(createBody, deps);
    expect(ok.status).toBe(201);
  });

  it("drives instance lifecycle", async () => {
    const store = seed();
    const deps = { actor: admin, store };
    expect((await handleBossStatus("nope", "active", deps)).status).toBe(400);
    expect((await handleBossStatus(IID, "archived", deps)).status).toBe(400);
    expect((await handleBossStatus(IID, "active", deps)).status).toBe(200);
    expect(
      (await handleCreateInstance({ bossId: "nope" }, deps)).status,
    ).toBe(400);
    const created = await handleCreateInstance(
      {
        bossId: IID,
        clanId: IID,
        startAt: "2026-09-12T00:00:00Z",
        endAt: "2026-09-13T00:00:00Z",
      },
      deps,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await handleActivateInstance(id, deps)).status).toBe(200);
    expect((await handleActivateInstance(id, deps)).status).toBe(409);
    expect((await handleFinalizeInstance("nope", deps)).status).toBe(400);
  });
});
