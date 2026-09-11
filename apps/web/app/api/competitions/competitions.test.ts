import { describe, expect, it } from "vitest";
import type { Actor } from "../../../lib/server/staff";
import {
  createMemoryCompetitionStore,
  type CompetitionDraftInput,
} from "../../../lib/server/competition-store";
import { handleCreateCompetition } from "./route";
import { handleGetCompetition, handleUpdateDraft } from "./[id]/route";
import {
  handleCompetitionAction,
  handleLeaderboard,
  handleRegister,
  handleResults,
} from "./_helper";

const teacher: Actor = {
  userId: "t-1",
  email: "t@example.com",
  roles: ["teacher"],
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

const session = { userId: "s-1", email: "s@example.com" };

const draftBody: CompetitionDraftInput = {
  slug: "comp-1",
  title: "Sprint",
  description: "",
  type: "SCORE_ATTACK",
  visibility: "batch",
  batchIds: [],
  courseIds: [],
  skillBands: [],
  gameSlugs: ["type-racer"],
  scoring: { metric: "score" },
  attemptPolicy: "BEST_SCORE",
  attemptLimit: 3,
  rewardPolicy: {},
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2026-01-02T00:00:00Z",
  registrationStartsAt: null,
  registrationEndsAt: null,
};

function staffStore() {
  return createMemoryCompetitionStore();
}

describe("POST /api/competitions", () => {
  it("rejects students with 403", async () => {
    const res = await handleCreateCompetition(draftBody, {
      session,
      actor: student,
      store: staffStore(),
    });
    expect(res.status).toBe(403);
  });

  it("rejects malformed bodies with 400", async () => {
    for (const body of [
      {},
      { ...draftBody, slug: "BAD SLUG" },
      { ...draftBody, gameSlugs: [] },
      { ...draftBody, type: "NOPE" },
      { ...draftBody, startsAt: "soon" },
    ]) {
      const res = await handleCreateCompetition(body, {
        session,
        actor: teacher,
        store: staffStore(),
      });
      expect(res.status).toBe(400);
    }
  });

  it("creates drafts with 201", async () => {
    const res = await handleCreateCompetition(draftBody, {
      session,
      actor: teacher,
      store: staffStore(),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    expect(created.id).toMatch(/^[0-9a-fA-F-]{36}$/);
  });
});

describe("PATCH /api/competitions/[id]", () => {
  it("rejects students and unknown ids", async () => {
    const store = staffStore();
    const id = await store.createCompetition(draftBody);
    const denied = await handleUpdateDraft(
      id,
      { title: "Hacked" },
      { session, actor: student, store },
    );
    expect(denied.status).toBe(403);
    const missing = await handleUpdateDraft(
      "missing",
      { title: "x" },
      { session, actor: teacher, store },
    );
    expect(missing.status).toBe(404);
  });

  it("edits drafts and surfaces NOT_DRAFT as 409", async () => {
    const store = staffStore();
    const id = await store.createCompetition(draftBody);
    const ok = await handleUpdateDraft(
      id,
      { title: "v2", attemptLimit: 2 },
      { session, actor: teacher, store },
    );
    expect(ok.status).toBe(200);
    await store.transitionCompetition(id, "scheduled");
    const locked = await handleUpdateDraft(
      id,
      { title: "v3" },
      { session, actor: teacher, store },
    );
    expect(locked.status).toBe(409);
  });
});

describe("competition actions", () => {
  it("publishes then finalizes with a summary, rejects re-finalize", async () => {
    const store = staffStore();
    const id = await store.createCompetition(draftBody);
    const deps = { session, actor: teacher, store };
    expect((await handleCompetitionAction(id, "publish", deps)).status).toBe(
      200,
    );
    const fin = await handleCompetitionAction(id, "finalize", deps);
    expect(fin.status).toBe(200);
    expect(await fin.json()).toMatchObject({
      ok: true,
      summary: { participants: 0, rewards: 0 },
    });
    expect(
      (await handleCompetitionAction(id, "finalize", deps)).status,
    ).toBe(409);
  });

  it("rejects students, bad ids and unknown actions", async () => {
    const store = staffStore();
    const deps = { session, actor: student, store };
    expect(
      (await handleCompetitionAction("00000000-0000-4000-8000-000000000001", "publish", deps)).status,
    ).toBe(403);
    const staff = { session, actor: teacher, store };
    expect(
      (await handleCompetitionAction("not-a-uuid", "publish", staff)).status,
    ).toBe(404);
    expect(
      (await handleCompetitionAction("00000000-0000-4000-8000-000000000001", "explode", staff)).status,
    ).toBe(404);
  });
});

describe("student competition endpoints", () => {
  it("404s opaque ids for detail, board and results", async () => {
    const deps = { session, store: staffStore() };
    expect((await handleGetCompetition("nope", deps)).status).toBe(404);
    expect((await handleLeaderboard("nope", deps)).status).toBe(404);
    expect((await handleResults("nope", deps)).status).toBe(404);
    expect((await handleRegister("nope", deps)).status).toBe(404);
  });

  it("registers, reads board and results after finalize", async () => {
    const store = staffStore();
    const id = await store.createCompetition(draftBody);
    await store.transitionCompetition(id, "registration_open");
    const deps = { session, store };
    const reg = await handleRegister(id, deps);
    expect(reg.status).toBe(201);
    const dup = await handleRegister(id, deps);
    expect(dup.status).toBe(409);
    expect((await handleLeaderboard(id, deps)).status).toBe(200);
    await store.transitionCompetition(id, "live");
    await store.transitionCompetition(id, "ended");
    await store.transitionCompetition(id, "processing");
    await store.finalizeCompetition(id);
    const board = await handleLeaderboard(id, deps);
    expect(await board.json()).toMatchObject({
      rows: [{ rank: 1, isMe: false }],
    });
    const results = await handleResults(id, deps);
    expect(results.status).toBe(200);
  });
});
