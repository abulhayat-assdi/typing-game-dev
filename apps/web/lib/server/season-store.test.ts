import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createMemorySeasonStore,
  mapStoreError,
} from "./season-store";

const SID = "00000000-0000-4000-8000-000000000001";

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

describe("memory season store", () => {
  it("lists seasons and reads detail with boards", async () => {
    const store = seed();
    expect(await store.listSeasons()).toMatchObject([{ slug: "s1" }]);
    const detail = await store.getSeason(SID, "u-1");
    expect(detail).toMatchObject({
      name: "Season One",
      myPoints: 160,
      myRank: 1,
      myTier: "Silver",
    });
    expect(await store.getSeason("missing", "u-1")).toBeNull();
    expect(await store.getBoard(SID, "student")).toHaveLength(1);
  });

  it("walks draft to cancelled", async () => {
    const store = createMemorySeasonStore();
    const id = await store.createSeason({
      slug: "s2",
      name: "Two",
      description: "",
      theme: "",
      startAt: "2026-10-01T00:00:00Z",
      endAt: "2026-12-31T00:00:00Z",
    });
    await store.updateSeasonDraft(id, { name: "Two v2" });
    await store.scheduleSeason(id);
    await expect(store.updateSeasonDraft(id, {})).rejects.toMatchObject({
      message: "NOT_DRAFT",
    });
    await store.activateSeason(id);
    await expect(store.cancelSeason(id)).rejects.toMatchObject({
      message: "INVALID_STATE",
    });
    await expect(store.scheduleSeason("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects malformed creates", async () => {
    const store = createMemorySeasonStore();
    await expect(
      store.createSeason({
        slug: "  ",
        name: "x",
        description: "",
        theme: "",
        startAt: "2026-10-01T00:00:00Z",
        endAt: "2026-12-31T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("advances through processing to finalized", async () => {
    const store = seed();
    expect(await store.advanceSeason(SID)).toBe("finalized");
  });

  it("maps database errors", () => {
    expect(mapStoreError({ message: "FORBIDDEN" })).toBeInstanceOf(ForbiddenError);
    expect(mapStoreError({ message: "OVERLAP_FORBIDDEN" })).toBeInstanceOf(
      ConflictError,
    );
    expect(mapStoreError({ message: "INELIGIBLE" })).toBeInstanceOf(NotFoundError);
  });
});
