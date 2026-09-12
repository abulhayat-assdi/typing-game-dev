import { describe, expect, it } from "vitest";
import { createMemoryWarStore } from "../../../lib/server/war-store";
import {
  handleBoard,
  handleCancel,
  handleChallenge,
  handleChallengeable,
  handleDispatch,
  handleFinalize,
  handleGetWar,
  handleListWars,
  handleRespond,
  handleSubmit,
  handleSync,
} from "./_helper";

const WID = "00000000-0000-4000-8000-000000000001";
const DID = "00000000-0000-4000-8000-000000000002";

const session = { userId: "u-1", email: "l@example.com" };

function seed() {
  return createMemoryWarStore({
    wars: [
      {
        summary: {
          id: WID,
          challengerClanId: "00000000-0000-4000-8000-000000000011",
          defenderClanId: DID,
          challengerName: "Mine",
          defenderName: "Theirs",
          status: "live",
          preparationStart: null,
          battleStart: "2026-09-12T00:00:00Z",
          battleEnd: "2026-09-12T02:00:00Z",
          myClanId: "00000000-0000-4000-8000-000000000011",
        },
        detail: {
          id: WID,
          challengerClanId: "00000000-0000-4000-8000-000000000011",
          defenderClanId: DID,
          challengerName: "Mine",
          defenderName: "Theirs",
          status: "live",
          preparationStart: null,
          battleStart: "2026-09-12T00:00:00Z",
          battleEnd: "2026-09-12T02:00:00Z",
          myClanId: "00000000-0000-4000-8000-000000000011",
          scoringMode: "sum",
          playerPolicy: "best_score",
          attemptsPerPlayer: 1,
          gameSlugs: ["type-racer"],
          myContribution: 0,
          myAttempts: 0,
        },
        board: [
          {
            scope: "clan",
            clanId: "00000000-0000-4000-8000-000000000011",
            displayName: "Mine",
            score: 70,
            attempts: 1,
            isMe: false,
          },
        ],
      },
    ],
  });
}

const challengeBody = {
  defenderClanId: DID,
  gameSlugs: ["type-racer"],
  scope: "same_course",
  prepHours: 2,
  battleHours: 2,
  attemptsPerPlayer: 5,
};

describe("war endpoints", () => {
  it("returns 401/503 without session/store", async () => {
    expect((await handleListWars({ session: null, store: seed() })).status).toBe(401);
    expect((await handleListWars({ session, store: null })).status).toBe(503);
  });

  it("404s opaque ids", async () => {
    const deps = { session, store: seed() };
    expect((await handleGetWar("nope", deps)).status).toBe(404);
    expect((await handleBoard("nope", deps)).status).toBe(404);
    expect((await handleCancel("nope", deps)).status).toBe(404);
  });

  it("lists wars and reads detail plus board", async () => {
    const deps = { session, store: seed() };
    const list = await handleListWars(deps);
    expect(await list.json()).toMatchObject({ wars: [{ id: WID }] });
    const detail = await handleGetWar(WID, deps);
    expect(await detail.json()).toMatchObject({
      war: { status: "live", attemptsPerPlayer: 1 },
    });
    const board = await handleBoard(WID, deps);
    expect(await board.json()).toMatchObject({
      board: [{ scope: "clan", displayName: "Mine" }],
    });
    const options = await handleChallengeable(deps);
    expect((await options.json()) as { clans: unknown[] }).toMatchObject({
      clans: [{ name: "Rivals" }],
    });
  });

  it("validates challenges with 400 then 201s", async () => {
    const store = createMemoryWarStore();
    const deps = { session, store };
    for (const body of [
      {},
      { ...challengeBody, defenderClanId: "nope" },
      { ...challengeBody, gameSlugs: [] },
      { ...challengeBody, scope: "galaxy" },
    ]) {
      expect((await handleChallenge(body, deps)).status).toBe(400);
    }
    const ok = await handleChallenge(challengeBody, deps);
    expect(ok.status).toBe(201);
  });

  it("walks dispatch/accept/cancel with 409s on illegal hops", async () => {
    const store = createMemoryWarStore();
    const deps = { session, store };
    const { id } = (await (
      await handleChallenge(challengeBody, deps)
    ).json()) as { id: string };
    expect((await handleDispatch(id, deps)).status).toBe(200);
    expect((await handleRespond(id, { accept: true }, deps)).status).toBe(200);
    expect((await handleCancel(id, deps)).status).toBe(200);
  });

  it("submits within limits then 409s", async () => {
    const deps = { session, store: seed() };
    expect((await handleSubmit(WID, {}, deps)).status).toBe(400);
    const ok = await handleSubmit(WID, { attemptId: DID }, deps);
    expect(ok.status).toBe(200);
    expect(
      (await handleSubmit(WID, { attemptId: DID }, deps)).status,
    ).toBe(409);
    expect((await handleSync(WID, deps)).status).toBe(200);
    const store2 = seed();
    const deps2 = { session, store: store2 };
    await store2.advance(WID);
    const fin = await handleFinalize(WID, deps2);
    expect(fin.status).toBe(200);
    expect(await fin.json()).toMatchObject({ war_id: WID });
  });
});
