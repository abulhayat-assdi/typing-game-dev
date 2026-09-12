import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createMemoryClanStore,
  mapStoreError,
} from "./clan-store";

const CID = "00000000-0000-4000-8000-000000000001";

function seed() {
  return createMemoryClanStore({
    clans: [
      {
        profile: {
          id: CID,
          name: "Batch 101 Clan",
          slug: "batch-101",
          motto: "Together",
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
            level: 2,
            xpTotal: 50,
            bestWpm: 30,
            bestAccuracy: 95,
            streakCurrent: 3,
            badgeCount: 1,
            contribution: 12,
            isMe: false,
          },
          {
            userId: "u-2",
            displayName: "Two",
            rollNumber: "R-02",
            role: "member",
            level: 1,
            xpTotal: 10,
            bestWpm: null,
            bestAccuracy: null,
            streakCurrent: 0,
            badgeCount: 0,
            contribution: 4,
            isMe: false,
          },
        ],
        missions: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            missionId: "00000000-0000-4000-8000-000000000021",
            slug: "clan-expedition",
            title: "Clan Expedition",
            status: "available",
            objectives: [
              {
                position: 0,
                kind: "GAMES_COMPLETED",
                current: 1,
                target: 2,
                completed: false,
                participants: 1,
              },
            ],
            periodStart: "2026-09-12",
          },
        ],
        requests: [],
      },
    ],
  });
}

describe("memory clan store", () => {
  it("resolves my clan with rank and totals", async () => {
    const store = seed();
    const mine = await store.getMyClan("u-1");
    expect(mine).toMatchObject({
      name: "Batch 101 Clan",
      memberCount: 2,
      totalXp: 16,
      myRole: "member",
      myRank: 1,
    });
    expect(await store.getMyClan("ghost")).toBeNull();
  });

  it("ranks roster and board", async () => {
    const store = seed();
    const roster = await store.getRoster(CID);
    expect(roster.map((r) => r.userId)).toEqual(["u-1", "u-2"]);
    const board = await store.getBoard("all");
    expect(board[0]).toMatchObject({ name: "Batch 101 Clan", totalPoints: 16, rank: 1 });
  });

  it("starts clan missions once", async () => {
    const store = seed();
    await store.startClanMission("00000000-0000-4000-8000-000000000011");
    await expect(
      store.startClanMission("00000000-0000-4000-8000-000000000011"),
    ).rejects.toMatchObject({ message: "INVALID_STATE" });
    await expect(store.startClanMission("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("opens, fills and closes help requests", async () => {
    const store = seed();
    const id = await store.createHelpRequest(CID, {}, 30);
    await expect(store.createHelpRequest(CID, {}, 10)).rejects.toMatchObject({
      message: "ALREADY_OPEN",
    });
    await store.contributeHelp(id, 30);
    const [req] = await store.getHelpRequests(CID);
    expect(req?.status).toBe("fulfilled");
    await expect(store.contributeHelp(id, 1)).rejects.toMatchObject({
      message: "CLOSED",
    });
    await expect(store.createHelpRequest(CID, {}, 0)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("assigns roles with validation", async () => {
    const store = seed();
    await store.assignRole(CID, "u-2", "co_leader");
    const roster = await store.getRoster(CID);
    expect(roster.find((r) => r.userId === "u-2")?.role).toBe("co_leader");
    await expect(store.assignRole(CID, "u-2", "boss")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("maps database errors", () => {
    expect(mapStoreError({ message: "FORBIDDEN" })).toBeInstanceOf(ForbiddenError);
    expect(mapStoreError({ message: "SELF_FULFILL" })).toBeInstanceOf(ConflictError);
    expect(mapStoreError({ message: "NOT_MEMBER" })).toBeInstanceOf(NotFoundError);
  });
});
