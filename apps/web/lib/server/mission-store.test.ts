import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createMemoryMissionStore,
  mapStoreError,
  type MissionInstance,
} from "./mission-store";

const inst = (over: Partial<MissionInstance> = {}): MissionInstance => ({
  instanceId: "00000000-0000-4000-8000-000000000001",
  missionId: "00000000-0000-4000-8000-000000000009",
  slug: "daily-grind",
  title: "Daily Grind",
  description: "Play games",
  category: "DAILY",
  difficulty: "beginner",
  period: "daily",
  periodStart: "2026-09-12",
  status: "available",
  objectives: [{ position: 0, kind: "GAMES_COMPLETED", current: 0, target: 2, completed: false }],
  rewardXp: 30,
  rewardCoins: 3,
  startedAt: null,
  completedAt: null,
  ...over,
});

describe("memory mission store", () => {
  it("lists today per user only", async () => {
    const store = createMemoryMissionStore({
      instances: [inst(), inst({ instanceId: "00000000-0000-4000-8000-000000000002" })],
      userId: "u-1",
    });
    expect((await store.getToday("u-1"))).toHaveLength(2);
    expect((await store.getToday("u-2"))).toHaveLength(0);
  });

  it("starts available missions once", async () => {
    const store = createMemoryMissionStore({ instances: [inst()] });
    await store.startMission("00000000-0000-4000-8000-000000000001");
    const got = await store.getInstance("00000000-0000-4000-8000-000000000001");
    expect(got?.status).toBe("active");
    await expect(
      store.startMission("00000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ message: "INVALID_STATE" });
    await expect(store.startMission("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("syncs active instances without mutating history", async () => {
    const store = createMemoryMissionStore({
      instances: [inst({ status: "active" }), inst({
        instanceId: "00000000-0000-4000-8000-000000000002",
        status: "completed",
      })],
    });
    expect(await store.syncMissions("u-1")).toBe(1);
  });

  it("creates mission drafts with uuid ids", async () => {
    const store = createMemoryMissionStore();
    const id = await store.createMission({
      slug: "m",
      title: "M",
      description: "",
      category: "DAILY",
      difficulty: "beginner",
      skillBand: null,
      period: "daily",
      objectives: [{ kind: "GAMES_COMPLETED", target: { count: 2 } }],
      gameSlugs: [],
      worldIds: [],
      rewardXp: 20,
      rewardCoins: 2,
      startsAt: null,
      endsAt: null,
    });
    expect(id).toMatch(/^[0-9a-fA-F-]{36}$/);
    await expect(
      store.createMission({
        slug: "  ",
        title: "x",
        description: "",
        category: "DAILY",
        difficulty: "beginner",
        skillBand: null,
        period: "daily",
        objectives: [],
        gameSlugs: [],
        worldIds: [],
        rewardXp: 0,
        rewardCoins: 0,
        startsAt: null,
        endsAt: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps database errors to typed errors", () => {
    expect(mapStoreError({ message: "FORBIDDEN" })).toBeInstanceOf(
      ForbiddenError,
    );
    expect(mapStoreError({ message: "ALREADY" })).toBeInstanceOf(
      ConflictError,
    );
    expect(mapStoreError({ message: "NOT_FOUND" })).toBeInstanceOf(
      NotFoundError,
    );
  });
});
