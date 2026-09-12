import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import { createMemoryTournamentStore } from "../../../lib/server/tournament-store";
import {
  handleGetTournament,
  handleListTournaments,
  handleRegister,
  handleTournamentBoard,
  handleWithdraw,
} from "./_helper";
import {
  handleCreateTournament,
  handleListTournaments as handleAdminList,
  handleTournamentAction,
} from "../admin/tournaments/_helper";

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

const sessionFor = (userId: string) => ({ userId, email: `${userId}@example.com` });

const U1 = "10000000-0000-4000-8000-000000000001";
const U2 = "10000000-0000-4000-8000-000000000002";
const U3 = "10000000-0000-4000-8000-000000000003";
const U4 = "10000000-0000-4000-8000-000000000004";
const U9 = "10000000-0000-4000-8000-000000000009";

const createBody = {
  slug: "cup-1",
  name: "Cup One",
  description: "",
  theme: "",
  format: "single_elimination",
  participantType: "student",
  startAt: null,
  endAt: null,
};

describe("student tournament endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    const store = createMemoryTournamentStore();
    expect(
      (await handleListTournaments({ session: null, store })).status,
    ).toBe(401);
    expect(
      (await handleListTournaments({ session: sessionFor(U1), store: null })).status,
    ).toBe(503);
  });

  it("404s opaque ids", async () => {
    const deps = { session: sessionFor(U1), store: createMemoryTournamentStore() };
    expect((await handleGetTournament("nope", deps)).status).toBe(404);
    expect((await handleTournamentBoard("nope", deps)).status).toBe(404);
    expect((await handleRegister("nope", {}, deps)).status).toBe(404);
  });

  it("registers, rejects duplicates, and withdraws", async () => {
    const store = createMemoryTournamentStore();
    const adminDeps = { actor: admin, store };
    const created = await handleCreateTournament(createBody, adminDeps);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await handleTournamentAction(id, "publish", {}, adminDeps)).status).toBe(200);

    const s1 = { session: sessionFor(U1), store };
    expect((await handleRegister(id, {}, s1)).status).toBe(200);
    const dup = await handleRegister(id, {}, s1);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: "DUPLICATE" });
    expect((await handleWithdraw(id, {}, s1)).status).toBe(200);
    expect((await handleRegister(id, {}, s1)).status).toBe(200);

    expect((await handleTournamentAction(id, "close", {}, adminDeps)).status).toBe(200);
    const closed = await handleRegister(id, {}, { session: sessionFor(U9), store });
    expect(closed.status).toBe(409);
    expect(await closed.json()).toMatchObject({ error: "REGISTRATION_CLOSED" });
  });

  it("runs a full four-player bracket to a champion", async () => {
    const store = createMemoryTournamentStore();
    const adminDeps = { actor: admin, store };
    const created = await handleCreateTournament(createBody, adminDeps);
    const { id } = (await created.json()) as { id: string };
    await handleTournamentAction(id, "publish", {}, adminDeps);
    for (const u of [U1, U2, U3, U4]) {
      const res = await handleRegister(
        id,
        {},
        { session: sessionFor(u), store },
      );
      expect(res.status).toBe(200);
    }
    await handleTournamentAction(id, "close", {}, adminDeps);
    const seeded = await handleTournamentAction(
      id,
      "seed",
      { method: "manual", order: [U1, U2, U3, U4] },
      adminDeps,
    );
    expect(await seeded.json()).toMatchObject({ ok: true, seeded: 4 });
    await handleTournamentAction(id, "start", {}, adminDeps);

    const board = (await (
      await handleTournamentBoard(id, { session: sessionFor(U1), store })
    ).json()) as {
      rounds: { roundNo: number; matches: { id: string; status: string }[] }[];
    };
    expect(board.rounds).toHaveLength(2);
    const semis = board.rounds[0]?.matches ?? [];
    expect(semis).toHaveLength(2);

    for (const [i, m] of semis.entries()) {
      await handleTournamentAction(id, "open", { matchId: m.id }, adminDeps);
      const fin = await handleTournamentAction(
        id,
        "finalize-match",
        { matchId: m.id, scoreA: i === 0 ? 10 : 7, scoreB: 5 },
        adminDeps,
      );
      expect(fin.status).toBe(200);
    }
    const adv = await handleTournamentAction(id, "advance", {}, adminDeps);
    expect(await adv.json()).toMatchObject({ ok: true, status: "live" });

    const board2 = (await (
      await handleTournamentBoard(id, { session: sessionFor(U1), store })
    ).json()) as {
      rounds: { roundNo: number; matches: { id: string }[] }[];
    };
    const final = board2.rounds[1]?.matches[0];
    expect(final).toBeDefined();
    if (!final) return;
    await handleTournamentAction(id, "open", { matchId: final.id }, adminDeps);
    await handleTournamentAction(
      id,
      "finalize-match",
      { matchId: final.id, scoreA: 12, scoreB: 8 },
      adminDeps,
    );
    const processing = await handleTournamentAction(id, "advance", {}, adminDeps);
    expect(await processing.json()).toMatchObject({ status: "processing" });
    const done = await handleTournamentAction(id, "finalize", {}, adminDeps);
    expect(await done.json()).toMatchObject({ ok: true, champion: U1 });

    const detail = (await (
      await handleGetTournament(id, { session: sessionFor(U1), store })
    ).json()) as {
      tournament: { status: string; results: { placement: number }[] };
    };
    expect(detail.tournament.status).toBe("finalized");
    expect(detail.tournament.results.map((r) => r.placement).sort()).toEqual([1, 2, 3, 3]);

    const again = await handleTournamentAction(id, "finalize", {}, adminDeps);
    expect(await again.json()).toMatchObject({ ok: true, already: true });
  });
});

describe("admin tournament endpoints", () => {
  it("rejects non-admins with 403", async () => {
    const store = createMemoryTournamentStore();
    const deps = { actor: student, store };
    expect((await handleAdminList(deps)).status).toBe(403);
    expect((await handleCreateTournament(createBody, deps)).status).toBe(403);
    const id = "00000000-0000-4000-8000-000000000001";
    expect((await handleTournamentAction(id, "publish", {}, deps)).status).toBe(403);
    expect((await handleTournamentAction(id, "finalize", {}, deps)).status).toBe(403);
  });

  it("validates creation bodies", async () => {
    const store = createMemoryTournamentStore();
    const deps = { actor: admin, store };
    expect((await handleCreateTournament({}, deps)).status).toBe(400);
    expect(
      (await handleCreateTournament({ ...createBody, slug: "BAD" }, deps)).status,
    ).toBe(400);
    expect(
      (
        await handleCreateTournament(
          { ...createBody, format: "swiss" },
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleCreateTournament(
          { ...createBody, participantType: "batch" },
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it("rejects bad action payloads", async () => {
    const store = createMemoryTournamentStore();
    const deps = { actor: admin, store };
    const created = await handleCreateTournament(createBody, deps);
    const { id } = (await created.json()) as { id: string };
    expect((await handleTournamentAction("nope", "publish", {}, deps)).status).toBe(404);
    expect((await handleTournamentAction(id, "seed", {}, deps)).status).toBe(400);
    expect(
      (await handleTournamentAction(id, "seed", { method: "swiss" }, deps)).status,
    ).toBe(400);
    expect(
      (await handleTournamentAction(id, "open", { matchId: "bad" }, deps)).status,
    ).toBe(400);
    expect(
      (
        await handleTournamentAction(
          id,
          "finalize-match",
          { matchId: id, scoreA: 1 },
          deps,
        )
      ).status,
    ).toBe(400);
  });
});
