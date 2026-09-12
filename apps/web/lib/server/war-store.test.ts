import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createMemoryWarStore,
  mapStoreError,
} from "./war-store";

const WID = "00000000-0000-4000-8000-000000000001";

function seed() {
  return createMemoryWarStore({
    wars: [
      {
        summary: {
          id: WID,
          challengerClanId: "00000000-0000-4000-8000-000000000001",
          defenderClanId: "00000000-0000-4000-8000-000000000002",
          challengerName: "Mine",
          defenderName: "Theirs",
          status: "challenge_sent",
          preparationStart: null,
          battleStart: null,
          battleEnd: null,
          myClanId: "00000000-0000-4000-8000-000000000001",
        },
        detail: {
          id: WID,
          challengerClanId: "00000000-0000-4000-8000-000000000001",
          defenderClanId: "00000000-0000-4000-8000-000000000002",
          challengerName: "Mine",
          defenderName: "Theirs",
          status: "challenge_sent",
          preparationStart: null,
          battleStart: null,
          battleEnd: null,
          myClanId: "00000000-0000-4000-8000-000000000001",
          scoringMode: "sum",
          playerPolicy: "best_score",
          attemptsPerPlayer: 1,
          gameSlugs: ["type-racer"],
          myContribution: 0,
          myAttempts: 0,
        },
        board: [],
      },
    ],
  });
}

describe("memory war store", () => {
  it("walks the lifecycle one hop at a time", async () => {
    const store = seed();
    await store.dispatch(WID);
    await store.respond(WID, true);
    expect(await store.advance(WID)).toBe("preparation");
    expect(await store.advance(WID)).toBe("live");
    const sub = await store.submitAttempt(WID, "a-1");
    expect(sub).toBe("sub-a-1");
    await expect(store.submitAttempt(WID, "a-2")).rejects.toMatchObject({
      message: "ATTEMPT_LIMIT",
    });
    expect(await store.advance(WID)).toBe("processing");
    const done = await store.finalize(WID);
    expect(done).toMatchObject({ war_id: WID });
    expect(await store.finalize(WID)).toMatchObject({ already: true });
  });

  it("rejects illegal hops and unknown wars", async () => {
    const store = seed();
    await expect(store.respond(WID, true)).rejects.toMatchObject({
      message: "INVALID_STATE",
    });
    await expect(store.submitAttempt(WID, "a-1")).rejects.toMatchObject({
      message: "NOT_LIVE",
    });
    await expect(store.dispatch("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(store.cancel("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("blocks duplicate active challenges", async () => {
    const store = seed();
    await expect(
      store.challenge({
        defenderClanId: "00000000-0000-4000-8000-000000000002",
        gameSlugs: ["g"],
        scope: "same_course",
        prepHours: 2,
        battleHours: 2,
        attemptsPerPlayer: 5,
      }),
    ).rejects.toMatchObject({ message: "ALREADY_ACTIVE" });
    await expect(
      store.challenge({
        defenderClanId: "",
        gameSlugs: [],
        scope: "same_course",
        prepHours: 2,
        battleHours: 2,
        attemptsPerPlayer: 5,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps database errors", () => {
    expect(mapStoreError({ message: "FORBIDDEN" })).toBeInstanceOf(
      ForbiddenError,
    );
    expect(mapStoreError({ message: "SELF_CHALLENGE" })).toBeInstanceOf(
      ConflictError,
    );
    expect(mapStoreError({ message: "NOT_PARTICIPANT" })).toBeInstanceOf(
      NotFoundError,
    );
  });
});
