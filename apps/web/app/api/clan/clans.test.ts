import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import { createMemoryClanStore } from "../../../lib/server/clan-store";
import {
  handleContributeHelp,
  handleCreateHelp,
  handleGetBoard,
  handleGetClan,
  handleGetClanMissions,
  handleGetHelp,
  handleGetMembers,
  handleStartClanMission,
  handleSyncClanMission,
} from "./_helper";
import {
  handleAssignRole,
  handleLinkMission,
  handleListClans,
  handleUpdateClan,
} from "../admin/clans/_helper";

const CID = "00000000-0000-4000-8000-000000000001";
const MID = "00000000-0000-4000-8000-000000000011";

const student: Actor = {
  userId: "u-1",
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

const session = { userId: "u-1", email: "s@example.com" };

function seed() {
  return createMemoryClanStore({
    clans: [
      {
        profile: {
          id: CID,
          name: "Batch Clan",
          slug: "batch-clan",
          motto: "",
          description: "",
          batchId: "batch-1",
          organizationId: "org-1",
          status: "active",
          memberCount: 0,
          totalXp: 0,
          myRole: null,
          myRank: null,
        },
        userId: "u-1",
        roster: [
          {
            userId: "u-1",
            displayName: "One",
            rollNumber: "R-01",
            role: "member",
            level: 1,
            xpTotal: 10,
            bestWpm: null,
            bestAccuracy: null,
            streakCurrent: 1,
            badgeCount: 0,
            contribution: 6,
            isMe: false,
          },
        ],
        missions: [
          {
            id: MID,
            missionId: "00000000-0000-4000-8000-000000000021",
            slug: "expedition",
            title: "Expedition",
            status: "available",
            objectives: [],
            periodStart: "2026-09-12",
          },
        ],
        requests: [],
      },
    ],
  });
}

describe("student clan endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    expect((await handleGetClan({ session: null, store: seed() })).status).toBe(401);
    expect((await handleGetClan({ session, store: null })).status).toBe(503);
  });

  it("404s without a clan", async () => {
    const deps = { session, store: createMemoryClanStore() };
    expect((await handleGetClan(deps)).status).toBe(404);
    expect((await handleGetMembers(deps)).status).toBe(404);
    expect((await handleGetClanMissions(deps)).status).toBe(404);
    expect((await handleGetHelp(deps)).status).toBe(404);
  });

  it("bundles dashboard, members, missions and board", async () => {
    const deps = { session, store: seed() };
    const dash = await handleGetClan(deps);
    expect(dash.status).toBe(200);
    expect(await dash.json()).toMatchObject({
      clan: { name: "Batch Clan", myRank: 1 },
    });
    expect((await handleGetMembers(deps)).status).toBe(200);
    expect((await handleGetClanMissions(deps)).status).toBe(200);
    const board = await handleGetBoard("weekly", deps);
    expect(await board.json()).toMatchObject({
      board: [{ name: "Batch Clan" }],
    });
  });

  it("starts clan missions once", async () => {
    const deps = { session, store: seed() };
    expect((await handleStartClanMission("nope", deps)).status).toBe(404);
    expect((await handleStartClanMission(MID, deps)).status).toBe(200);
    expect((await handleStartClanMission(MID, deps)).status).toBe(409);
    expect((await handleSyncClanMission(MID, deps)).status).toBe(200);
  });

  it("opens and funds help requests", async () => {
    const deps = { session, store: seed() };
    expect((await handleCreateHelp({ requested: 0 }, deps)).status).toBe(400);
    expect((await handleCreateHelp({ requested: 51 }, deps)).status).toBe(400);
    const created = await handleCreateHelp(
      { requested: 20, context: { unlock: "Word Dragon" } },
      deps,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await handleContributeHelp(id, { amount: 0 }, deps)).status).toBe(400);
    expect((await handleContributeHelp("nope", { amount: 5 }, deps)).status).toBe(404);
    expect((await handleContributeHelp(id, { amount: 20 }, deps)).status).toBe(200);
    const help = await handleGetHelp(deps);
    expect(await help.json()).toMatchObject({
      help: [{ status: "fulfilled", fulfilled: 20 }],
    });
  });
});

describe("admin clan endpoints", () => {
  it("lists clans and rejects non-admins", async () => {
    expect(
      (await handleListClans({ actor: student, store: seed() })).status,
    ).toBe(403);
    const res = await handleListClans({ actor: admin, store: seed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ clans: [{ name: "Batch Clan" }] });
  });

  it("edits profile, assigns roles, links missions", async () => {
    const store = seed();
    const deps = { actor: admin, store };
    expect((await handleUpdateClan("nope", {}, deps)).status).toBe(400);
    expect(
      (await handleUpdateClan(CID, { motto: "Go!" }, deps)).status,
    ).toBe(200);
    expect(
      (await handleAssignRole(CID, { userId: "u-1", role: "boss" }, deps)).status,
    ).toBe(400);
    expect(
      (await handleAssignRole(CID, { userId: "u-1", role: "leader" }, deps)).status,
    ).toBe(400);
    expect(
      (
        await handleLinkMission(
          CID,
          { missionId: "00000000-0000-4000-8000-000000000099" },
          deps,
        )
      ).status,
    ).toBe(201);
    expect(
      (await handleAssignRole(CID, { userId: "u-1", role: "leader" }, { actor: student, store })).status,
    ).toBe(403);
  });
});
