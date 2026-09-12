import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createMemoryBossStore,
  mapStoreError,
} from "./boss-store";

const IID = "00000000-0000-4000-8000-000000000001";

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

describe("memory boss store", () => {
  it("lists bosses and clan instances", async () => {
    const store = seed();
    expect(await store.listBosses()).toMatchObject([{ slug: "stone-titan" }]);
    expect(await store.listInstances("clan-1")).toMatchObject([
      { id: IID, status: "active", currentHp: 100 },
    ]);
  });

  it("reads state and deals damage to zero", async () => {
    const store = seed();
    const state = await store.getState(IID);
    expect(state?.boss.name).toBe("Stone Titan");
    expect(await store.getState("missing")).toBeNull();
    for (let i = 0; i < 10; i++) {
      await store.submitAttempt(IID, `a-${String(i)}`);
    }
    const done = await store.getState(IID);
    expect(done?.instance.currentHp).toBe(0);
    expect(done?.instance.status).toBe("defeated");
    await expect(store.submitAttempt(IID, "late")).rejects.toMatchObject({
      message: "NOT_ACTIVE",
    });
  });

  it("activates once and finalizes once", async () => {
    const store = createMemoryBossStore({
      bosses: [],
    });
    await expect(store.activateInstance("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const s2 = seed();
    await expect(store.finalizeInstance(IID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(s2.finalizeInstance(IID)).rejects.toMatchObject({
      message: "INVALID_STATE",
    });
  });

  it("creates instances and bosses with uuid ids", async () => {
    const store = seed();
    const id = await store.createInstance("b", "c", "s", "e");
    expect(id).toMatch(/^[0-9a-fA-F-]{36}$/);
    const b = await store.createBoss({
      slug: "x",
      name: "X",
      description: "",
      lore: "",
      difficulty: "easy",
      maxHp: 10,
      phases: [],
      rewardXp: 1,
      rewardCoins: 0,
    });
    expect(b).toMatch(/^[0-9a-fA-F-]{36}$/);
  });

  it("maps database errors", () => {
    expect(mapStoreError({ message: "FORBIDDEN" })).toBeInstanceOf(ForbiddenError);
    expect(mapStoreError({ message: "DUPLICATE" })).toBeInstanceOf(ConflictError);
    expect(mapStoreError({ message: "BOSS_INACTIVE" })).toBeInstanceOf(NotFoundError);
  });
});
