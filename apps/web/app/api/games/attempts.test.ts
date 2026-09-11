import { describe, expect, it } from "vitest";
import type { BuiltPrompt } from "@tap/content";
import {
  createMemoryAttemptStore,
  type AttemptStore,
  type StoreGame,
} from "../../../lib/server/attempt-store";
import { handleGetAttempt } from "./[gameId]/attempts/[attemptId]/route";
import { handleStartAttempt } from "./[gameId]/attempts/start/route";
import { handleSubmitAttempt } from "./[gameId]/attempts/[attemptId]/submit/route";

const U1 = { userId: "u-1", email: null };
const U2 = { userId: "u-2", email: null };

function stubPrompt(game: StoreGame, seed: string): BuiltPrompt {
  return {
    text: `PROMPT-${game.slug}-${seed}`,
    setRef: game.promptSetRef,
    setVersion: 1,
    seed,
    units: 1,
  };
}

async function mustGame(store: AttemptStore, slug: string): Promise<StoreGame> {
  const game = await store.getActiveGame(slug);
  if (!game) throw new Error(`test game missing: ${slug}`);
  return game;
}

function freshStore(): Promise<AttemptStore> {
  return Promise.resolve(createMemoryAttemptStore());
}

describe("POST start", () => {
  it("returns 401 without a session", async () => {
    const res = await handleStartAttempt(
      "test-game",
      {},
      { session: null, store: await freshStore(), prompt: stubPrompt },
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 without a store", async () => {
    const res = await handleStartAttempt(
      "test-game",
      {},
      { session: U1, store: null, prompt: stubPrompt },
    );
    expect(res.status).toBe(503);
  });

  it("returns 404 for unknown or retired games", async () => {
    const store = await freshStore();
    for (const slug of ["nope", "retired-game"]) {
      const res = await handleStartAttempt(
        slug,
        {},
        { session: U1, store, prompt: stubPrompt },
      );
      expect(res.status, slug).toBe(404);
    }
  });

  it("returns 400 for invalid difficulty", async () => {
    const res = await handleStartAttempt(
      "test-game",
      { difficulty: "grandmaster" },
      { session: U1, store: await freshStore(), prompt: stubPrompt },
    );
    expect(res.status).toBe(400);
  });

  it("binds an attempt and returns the runtime payload", async () => {
    const res = await handleStartAttempt(
      "test-game",
      { difficulty: "beginner", seed: "s-1" },
      { session: U1, store: await freshStore(), prompt: stubPrompt },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.attemptId).toMatch(/^attempt-/);
    expect(body.expectedText).toBe("PROMPT-test-game-s-1");
    expect(body.difficulty).toBe("beginner");
    expect(Date.parse(body.expiresAt as string)).toBeGreaterThan(Date.now());
  });
});

describe("POST submit", () => {
  async function started(
    store: AttemptStore,
    expectedText: string,
    userId = U1.userId,
  ): Promise<string> {
    const game = await mustGame(store, "test-game");
    const a = await store.startAttempt({
      game,
      userId,
      difficulty: "beginner",
      seed: "s",
      expectedText,
    });
    return a.id;
  }

  it("returns 401 without a session", async () => {
    const res = await handleSubmitAttempt(
      "test-game",
      "attempt-1",
      { typedText: "x", elapsedMs: 1000 },
      { session: null, store: await freshStore() },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown, foreign, or mismatched attempts", async () => {
    const store = await freshStore();
    const id = await started(store, "hello world", U2.userId);
    for (const [slug, aid] of [
      ["test-game", "nope"],
      ["test-game", id],
      ["other-game", id],
    ] as const) {
      const res = await handleSubmitAttempt(
        slug,
        aid,
        { typedText: "hello world", elapsedMs: 30000 },
        { session: U1, store },
      );
      expect(res.status, `${slug}/${aid}`).toBe(404);
    }
  });

  it("validates an honest attempt with server-computed score", async () => {
    const store = await freshStore();
    const id = await started(store, "hello world");
    const res = await handleSubmitAttempt(
      "test-game",
      id,
      { typedText: "hello world", elapsedMs: 30000, corrections: 0 },
      { session: U1, store },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("validated");
    expect(body.score as number).toBeGreaterThan(0);
    expect(body.accuracy).toBe(100);
  });

  it("rejects forged accuracy claims (recorded, not trusted)", async () => {
    const store = await freshStore();
    const id = await started(store, "hello world");
    const res = await handleSubmitAttempt(
      "test-game",
      id,
      { typedText: "hello world", elapsedMs: 30000, claimedAccuracy: 10 },
      { session: U1, store },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "rejected",
      reason: "FORGED_ACCURACY",
    });
  });

  it("rejects impossible WPM", async () => {
    const store = await freshStore();
    const text = "a".repeat(100);
    const id = await started(store, text);
    const res = await handleSubmitAttempt(
      "test-game",
      id,
      { typedText: text, elapsedMs: 100 },
      { session: U1, store },
    );
    expect(await res.json()).toMatchObject({
      status: "rejected",
      reason: "IMPOSSIBLE_WPM",
    });
  });

  it("rejects duplicate finalization with 409", async () => {
    const store = await freshStore();
    const id = await started(store, "hello world");
    const body = { typedText: "hello world", elapsedMs: 30000 };
    expect(
      (await handleSubmitAttempt("test-game", id, body, { session: U1, store }))
        .status,
    ).toBe(200);
    const retry = await handleSubmitAttempt("test-game", id, body, {
      session: U1,
      store,
    });
    expect(retry.status).toBe(409);
  });

  it("rejects expired attempts with 410", async () => {
    const store = createMemoryAttemptStore();
    const id = await started(store, "hello world");
    const live = store.__live.get(id);
    if (!live) throw new Error("attempt missing");
    live.expiresAt = new Date(Date.now() - 1000).toISOString();
    const res = await handleSubmitAttempt(
      "test-game",
      id,
      { typedText: "hello world", elapsedMs: 30000 },
      { session: U1, store },
    );
    expect(res.status).toBe(410);
  });

  it("rejects malformed payloads with 400", async () => {

    const store = await freshStore();
    const game = await mustGame(store, "test-game");
    const a = await store.startAttempt({
      game,
      userId: U1.userId,
      difficulty: "beginner",
      seed: "s",
      expectedText: "hello world",
    });
    for (const body of [{}, { typedText: "", elapsedMs: 1000 }, null]) {
      const res = await handleSubmitAttempt("test-game", a.id, body, {
        session: U1,
        store,
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("attaches progression to validated responses", async () => {
    const store = await freshStore();
    const id = await started(store, "hello world");
    const res = await handleSubmitAttempt(
      "test-game",
      id,
      { typedText: "hello world", elapsedMs: 30000 },
      { session: U1, store },
    );
    const body = (await res.json()) as {
      progression: {
        alreadyProcessed: boolean;
        xp: number;
        coins: number;
        level: number;
        xpTotal: number;
      } | null;
    };
    expect(body.progression?.alreadyProcessed).toBe(false);
    expect(body.progression?.xp).toBeGreaterThan(0);
    expect(body.progression?.coins).toBeGreaterThan(0);
    expect(body.progression?.level).toBeGreaterThanOrEqual(1);
    expect(body.progression?.xpTotal).toBe(body.progression?.xp);
  });

  it("accumulates progression across attempts without double grants", async () => {
    const store = await freshStore();
    const first = await handleSubmitAttempt(
      "test-game",
      await started(store, "hello world"),
      { typedText: "hello world", elapsedMs: 30000 },
      { session: U1, store },
    );
    const second = await handleSubmitAttempt(
      "test-game",
      await started(store, "hello world"),
      { typedText: "hello world", elapsedMs: 30000 },
      { session: U1, store },
    );
    const b1 = (await first.json()) as {
      progression: { xp: number; xpTotal: number };
    };
    const b2 = (await second.json()) as {
      progression: { xp: number; xpTotal: number };
    };
    // Second run: no first-completion bonus, but totals still accumulate.
    expect(b2.progression.xp).toBeLessThan(b1.progression.xp);
    expect(b2.progression.xpTotal).toBe(
      b1.progression.xpTotal + b2.progression.xp,
    );
  });

  it("returns 500 when progression fails, keeping the validated attempt", async () => {
    const base = await freshStore();
    const store = {
      ...base,
      processProgression: () => Promise.reject(new Error("ledger down")),
    };
    const game = await mustGame(store, "test-game");
    const a = await store.startAttempt({
      game,
      userId: U1.userId,
      difficulty: "beginner",
      seed: "s",
      expectedText: "hello world",
    });
    const res = await handleSubmitAttempt(
      "test-game",
      a.id,
      { typedText: "hello world", elapsedMs: 30000 },
      { session: U1, store },
    );
    expect(res.status).toBe(500);
    const attempt = await base.getAttempt(a.id);
    expect(attempt?.status).toBe("validated");
  });
});

describe("GET attempt", () => {
  it("returns 401 without a session", async () => {
    const res = await handleGetAttempt("test-game", "attempt-1", {
      session: null,
      store: await freshStore(),
    });
    expect(res.status).toBe(401);
  });

  it("hides foreign attempts with 404", async () => {
    const store = await freshStore();
    const game = await mustGame(store, "test-game");
    const a = await store.startAttempt({
      game,
      userId: U2.userId,
      difficulty: "beginner",
      seed: "s",
      expectedText: "hello world",
    });
    const res = await handleGetAttempt("test-game", a.id, {
      session: U1,
      store,
    });
    expect(res.status).toBe(404);
  });

  it("returns live attempts without a result, validated ones with it", async () => {
    const store = await freshStore();
    const game = await mustGame(store, "test-game");
    const a = await store.startAttempt({
      game,
      userId: U1.userId,
      difficulty: "beginner",
      seed: "s",
      expectedText: "hello world",
    });
    const live = await handleGetAttempt("test-game", a.id, {
      session: U1,
      store,
    });
    expect(live.status).toBe(200);
    expect(await live.json()).toMatchObject({
      attempt: { id: a.id, status: "started" },
      result: null,
    });

    await handleSubmitAttempt(
      "test-game",
      a.id,
      { typedText: "hello world", elapsedMs: 30000 },
      { session: U1, store },
    );
    const done = await handleGetAttempt("test-game", a.id, {
      session: U1,
      store,
    });
    const body = (await done.json()) as {
      attempt: { status: string };
      result: { score: number } | null;
    };
    expect(body.attempt.status).toBe("validated");
    expect(body.result?.score).toBeGreaterThan(0);
  });
});
