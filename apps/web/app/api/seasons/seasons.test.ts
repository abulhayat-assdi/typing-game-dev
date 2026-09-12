import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import { createMemorySeasonStore } from "../../../lib/server/season-store";
import {
  handleGetSeason,
  handleListSeasons,
  handleSeasonBoard,
} from "./_helper";
import {
  handleCreateSeason,
  handleListSeasons as handleAdminList,
  handleSeasonAction,
} from "../admin/seasons/_helper";

const SID = "00000000-0000-4000-8000-000000000001";

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

const session = { userId: "u-1", email: "u@example.com" };

function seed() {
  return createMemorySeasonStore({
    seasons: [
      {
        summary: {
          id: SID,
          slug: "s1",
          name: "Season One",
          theme: "Rise",
          status: "active",
          startAt: "2026-10-01T00:00:00Z",
          endAt: "2026-12-31T00:00:00Z",
        },
        board: [
          {
            rank: 1,
            participantId: "u-1",
            displayName: "One",
            points: 160,
            tier: "Silver",
          },
        ],
      },
    ],
  });
}

const createBody = {
  slug: "s2",
  name: "Season Two",
  description: "",
  theme: "",
  startAt: "2026-10-01T00:00:00Z",
  endAt: "2026-12-31T00:00:00Z",
};

describe("student season endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    expect((await handleListSeasons({ session: null, store: seed() })).status).toBe(401);
    expect((await handleListSeasons({ session, store: null })).status).toBe(503);
  });

  it("404s opaque ids and reads detail plus boards", async () => {
    const deps = { session, store: seed() };
    expect((await handleGetSeason("nope", deps)).status).toBe(404);
    expect((await handleSeasonBoard("nope", "student", deps)).status).toBe(404);
    const list = await handleListSeasons(deps);
    expect(await list.json()).toMatchObject({ seasons: [{ slug: "s1" }] });
    const detail = await handleGetSeason(SID, deps);
    expect(await detail.json()).toMatchObject({
      season: { name: "Season One", myPoints: 160, myTier: "Silver" },
    });
    const board = await handleSeasonBoard(SID, "clan", deps);
    expect(board.status).toBe(200);
  });
});

describe("admin season endpoints", () => {
  it("rejects non-admins with 403", async () => {
    const store = seed();
    const deps = { actor: student, store };
    expect((await handleAdminList(deps)).status).toBe(403);
    expect((await handleCreateSeason(createBody, deps)).status).toBe(403);
    expect((await handleSeasonAction(SID, "schedule", {}, deps)).status).toBe(403);
    expect((await handleSeasonAction(SID, "advance", {}, deps)).status).toBe(403);
  });

  it("validates creates with 400 then 201s", async () => {
    const store = seed();
    const deps = { actor: admin, store };
    for (const body of [
      {},
      { ...createBody, slug: "BAD" },
      { ...createBody, startAt: "2026-12-31T00:00:00Z", endAt: "2026-10-01T00:00:00Z" },
    ]) {
      expect((await handleCreateSeason(body, deps)).status).toBe(400);
    }
    expect((await handleCreateSeason(createBody, deps)).status).toBe(201);
  });

  it("drives lifecycle and configuration", async () => {
    const store = seed();
    const deps = { actor: admin, store };
    const { id } = (await (
      await handleCreateSeason(createBody, deps)
    ).json()) as { id: string };
    expect((await handleSeasonAction("nope", "schedule", {}, deps)).status).toBe(404);
    expect((await handleSeasonAction(id, "explode", {}, deps)).status).toBe(404);
    expect((await handleSeasonAction(id, "schedule", {}, deps)).status).toBe(200);
    expect((await handleSeasonAction(id, "activate", {}, deps)).status).toBe(200);
    expect((await handleSeasonAction(id, "source", { source: "MISSION" }, deps)).status).toBe(200);
    expect(
      (await handleSeasonAction(id, "tier", { tier: "Gold", minPoints: 200 }, deps)).status,
    ).toBe(200);
    expect((await handleSeasonAction(id, "update", { patch: {} }, deps)).status).toBe(409);
    const advanced = await handleSeasonAction(id, "advance", {}, deps);
    expect(await advanced.json()).toMatchObject({ status: "finalized" });
  });
});
