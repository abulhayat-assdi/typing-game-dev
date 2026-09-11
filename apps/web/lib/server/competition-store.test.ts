import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createMemoryCompetitionStore,
  mapStoreError,
  type CompetitionDraftInput,
} from "./competition-store";

const draft: CompetitionDraftInput = {
  slug: "comp-1",
  title: "Sprint",
  description: "rules",
  type: "SCORE_ATTACK",
  visibility: "batch",
  batchIds: ["batch-1"],
  courseIds: [],
  skillBands: ["beginner"],
  gameSlugs: ["type-racer"],
  scoring: { metric: "score" },
  attemptPolicy: "BEST_SCORE",
  attemptLimit: 3,
  rewardPolicy: { xp: { "1": 100, participation: 10 }, coins: {} },
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2026-01-02T00:00:00Z",
  registrationStartsAt: null,
  registrationEndsAt: null,
};

describe("memory competition store", () => {
  it("creates drafts and edits them", async () => {
    const store = createMemoryCompetitionStore();
    const id = await store.createCompetition(draft);
    await store.updateDraft(id, { title: "Sprint v2" });
    const got = await store.getCompetition(id, "u-1");
    expect(got?.title).toBe("Sprint v2");
    expect(got?.status).toBe("draft");
  });

  it("rejects malformed creates and unknown ids", async () => {
    const store = createMemoryCompetitionStore();
    await expect(
      store.createCompetition({ ...draft, title: "  " }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(store.getCompetition("nope", "u-1")).resolves.toBeNull();
    await expect(store.updateDraft("nope", {})).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("blocks draft edits after leaving draft", async () => {
    const store = createMemoryCompetitionStore();
    const id = await store.createCompetition(draft);
    await store.transitionCompetition(id, "scheduled");
    await expect(store.updateDraft(id, { title: "x" })).rejects.toMatchObject({
      message: "NOT_DRAFT",
    });
  });

  it("registers once and rejects duplicates + closed windows", async () => {
    const store = createMemoryCompetitionStore();
    const id = await store.createCompetition(draft);
    await expect(
      store.registerEntry(id, "u-1"),
    ).rejects.toMatchObject({ message: "REGISTRATION_CLOSED" });
    await store.transitionCompetition(id, "registration_open");
    await store.registerEntry(id, "u-1");
    await expect(store.registerEntry(id, "u-1")).rejects.toMatchObject({
      message: "ALREADY_REGISTERED",
    });
    const got = await store.getCompetition(id, "u-1");
    expect(got?.myEntry?.status).toBe("registered");
  });

  it("finalizes once with an idempotent-shaped summary", async () => {
    const store = createMemoryCompetitionStore();
    const id = await store.createCompetition(draft);
    await store.transitionCompetition(id, "registration_open");
    await store.registerEntry(id, "u-1");
    await store.registerEntry(id, "u-2");
    const summary = await store.finalizeCompetition(id);
    expect(summary.participants).toBe(2);
    await expect(store.finalizeCompetition(id)).rejects.toMatchObject({
      message: "INVALID_STATE",
    });
    const board = await store.getLeaderboard(id);
    expect(board.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("hides results until finalized", async () => {
    const store = createMemoryCompetitionStore();
    const id = await store.createCompetition(draft);
    expect(await store.getResults(id)).toEqual([]);
  });

  it("maps database errors to typed errors", () => {
    expect(mapStoreError({ message: "FORBIDDEN" })).toBeInstanceOf(
      ForbiddenError,
    );
    expect(mapStoreError({ message: "duplicate key" })).toBeInstanceOf(
      ConflictError,
    );
    expect(mapStoreError({ message: "NOT_FOUND" })).toBeInstanceOf(
      NotFoundError,
    );
  });
});
