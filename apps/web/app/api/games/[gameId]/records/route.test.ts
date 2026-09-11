import { describe, expect, it } from "vitest";
import { createMemoryStudentStore } from "../../../../../lib/server/student-store";
import { handleGetRecords } from "./route";

describe("GET records", () => {
  const store = () =>
    createMemoryStudentStore({
      games: [
        {
          slug: "g-a",
          worldSlug: "w",
          category: "word",
          mechanic: "time-trial",
          mode: "word",
          difficulty: "beginner",
          timingKind: "untimed",
          timingLimitSeconds: null,
          titleEn: "A",
          titleBn: "",
          descriptionEn: "",
        },
      ],
      records: [
        {
          userId: "u-1",
          gameSlug: "g-a",
          metric: "best_score",
          value: 91,
          attemptId: "a1",
        },
      ],
    });

  it("returns 401 without a session", async () => {
    const res = await handleGetRecords("g-a", {
      session: null,
      store: store(),
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 without a store", async () => {
    const res = await handleGetRecords("g-a", {
      session: { userId: "u-1", email: null },
      store: null,
    });
    expect(res.status).toBe(503);
  });

  it("returns 404 for unknown games", async () => {
    const res = await handleGetRecords("nope", {
      session: { userId: "u-1", email: null },
      store: store(),
    });
    expect(res.status).toBe(404);
  });

  it("returns own records, never another user's", async () => {
    const mine = await handleGetRecords("g-a", {
      session: { userId: "u-1", email: null },
      store: store(),
    });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({
      gameSlug: "g-a",
      records: [{ gameSlug: "g-a", metric: "best_score", value: 91 }],
    });
    const other = await handleGetRecords("g-a", {
      session: { userId: "u-2", email: null },
      store: store(),
    });
    expect(await other.json()).toMatchObject({ records: [] });
  });
});
