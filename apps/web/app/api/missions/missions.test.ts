import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import {
  createMemoryMissionStore,
  type MissionInstance,
} from "../../../lib/server/mission-store";
import {
  handleGetMission,
  handleGetMissions,
  handleStartMission,
  handleSyncMissions,
} from "./_helper";
import {
  handleAddObjective,
  handleCreateMission,
  handleListMissions,
  handleMissionStatus,
  handleUpdateMission,
} from "../admin/missions/_helper";

const student: Actor = {
  userId: "s-1",
  email: "s@example.com",
  roles: ["student"],
  adminOrgIds: [],
  status: "active",
};

const admin: Actor = {
  userId: "a-1",
  email: "a@example.com",
  roles: ["admin"],
  adminOrgIds: ["org-1"],
  status: "active",
};

const session = { userId: "s-1", email: "s@example.com" };
const IID = "00000000-0000-4000-8000-000000000001";

const inst = (over: Partial<MissionInstance> = {}): MissionInstance => ({
  instanceId: IID,
  missionId: "00000000-0000-4000-8000-000000000009",
  slug: "daily-grind",
  title: "Daily Grind",
  description: "",
  category: "DAILY",
  difficulty: "beginner",
  period: "daily",
  periodStart: "2026-09-12",
  status: "available",
  objectives: [
    { position: 0, kind: "GAMES_COMPLETED", current: 0, target: 2, completed: false },
  ],
  rewardXp: 30,
  rewardCoins: 3,
  startedAt: null,
  completedAt: null,
  ...over,
});

const createBody = {
  slug: "daily-grind",
  title: "Daily Grind",
  description: "",
  category: "DAILY",
  difficulty: "beginner",
  skillBand: "",
  objectives: [{ kind: "GAMES_COMPLETED", target: { count: 2 } }],
  gameSlugs: [],
  worldIds: [],
  rewardXp: 30,
  rewardCoins: 3,
  startsAt: "",
  endsAt: "",
};

describe("GET /api/missions", () => {
  it("returns 401 without a session", async () => {
    const res = await handleGetMissions({
      session: null,
      store: createMemoryMissionStore(),
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 without a store", async () => {
    const res = await handleGetMissions({ session, store: null });
    expect(res.status).toBe(503);
  });

  it("splits periods", async () => {
    const store = createMemoryMissionStore({
      instances: [
        inst(),
        inst({
          instanceId: "00000000-0000-4000-8000-000000000002",
          period: "weekly",
        }),
      ],
      userId: "s-1",
    });
    const res = await handleGetMissions({ session, store });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      daily: [{ slug: "daily-grind" }],
      weekly: [{ period: "weekly" }],
      event: [],
    });
  });
});

describe("mission detail + start", () => {
  it("404s opaque ids", async () => {
    const deps = { session, store: createMemoryMissionStore() };
    expect((await handleGetMission("nope", deps)).status).toBe(404);
    expect((await handleStartMission("nope", deps)).status).toBe(404);
  });

  it("starts once then 409s", async () => {
    const store = createMemoryMissionStore({ instances: [inst()] });
    const deps = { session, store };
    expect((await handleStartMission(IID, deps)).status).toBe(200);
    expect((await handleStartMission(IID, deps)).status).toBe(409);
    const detail = await handleGetMission(IID, deps);
    expect(await detail.json()).toMatchObject({
      mission: { status: "active" },
    });
  });

  it("syncs and returns the set", async () => {
    const store = createMemoryMissionStore({
      instances: [inst({ status: "active" })],
      userId: "s-1",
    });
    const res = await handleSyncMissions({ session, store });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ synced: 1 });
  });
});

describe("admin missions", () => {
  it("rejects non-admins with 403", async () => {
    const store = createMemoryMissionStore();
    const deps = { actor: student, store };
    expect((await handleListMissions(deps)).status).toBe(403);
    expect((await handleCreateMission(createBody, deps)).status).toBe(403);
    expect(
      (await handleUpdateMission(IID, {}, deps)).status,
    ).toBe(403);
    expect(
      (await handleMissionStatus(IID, "active", deps)).status,
    ).toBe(403);
    expect(
      (await handleAddObjective(IID, {}, deps)).status,
    ).toBe(403);
  });

  it("validates creates with 400 then 201s", async () => {
    const store = createMemoryMissionStore();
    const deps = { actor: admin, store };
    for (const body of [
      {},
      { ...createBody, slug: "BAD" },
      { ...createBody, objectives: [] },
      { ...createBody, objectives: [{ kind: "NOPE", target: {} }] },
      { ...createBody, category: "CLAN" },
    ]) {
      expect((await handleCreateMission(body, deps)).status).toBe(400);
    }
    const ok = await handleCreateMission(createBody, deps);
    expect(ok.status).toBe(201);
  });

  it("updates, toggles status and adds objectives", async () => {
    const store = createMemoryMissionStore();
    const deps = { actor: admin, store };
    expect(
      (await handleUpdateMission("not-a-uuid", {}, deps)).status,
    ).toBe(400);
    expect(
      (await handleUpdateMission(IID, { title: "v2" }, deps)).status,
    ).toBe(200);
    expect(
      (await handleMissionStatus(IID, "active", deps)).status,
    ).toBe(200);
    expect(
      (await handleMissionStatus(IID, "archived", deps)).status,
    ).toBe(400);
    expect(
      (
        await handleAddObjective(
          IID,
          { kind: "GAMES_COMPLETED", target: { count: 1 } },
          deps,
        )
      ).status,
    ).toBe(201);
  });
});
