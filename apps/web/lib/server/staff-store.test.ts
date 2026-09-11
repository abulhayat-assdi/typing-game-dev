import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  createMemoryStaffStore,
} from "./staff-store";

describe("memory staff store", () => {
  it("logs mutations for assertions", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const store = createMemoryStaffStore({ calls });
    await store.createCourse({ organizationId: "o", title: "T", slug: "t" });
    await store.updateAccountStatus("u", "suspended");
    expect(calls.map((c) => c.method)).toEqual([
      "createCourse",
      "updateAccountStatus",
    ]);
    expect(calls[0]?.args).toMatchObject([{ title: "T" }]);
  });

  it("simulates RLS denials and conflicts", () => {
    const denied = createMemoryStaffStore({ deny: ["createBatch"] });
    expect(() =>
      denied.createBatch({ courseId: "c", name: "n", joinCode: "j" }),
    ).toThrow(ForbiddenError);
    const conflicted = createMemoryStaffStore({ conflict: ["createCourse"] });
    expect(() =>
      conflicted.createCourse({ organizationId: "o", title: "t", slug: "t" }),
    ).toThrow(ConflictError);
  });

  it("resolves lookups case-insensitively", async () => {
    const store = createMemoryStaffStore({
      searchResults: [
        {
          userId: "u",
          fullName: "Tea Cher",
          email: "Teach@Example.com",
          rollNumber: "",
          batchName: "",
          batchId: "",
          status: "active",
        },
      ],
    });
    await expect(
      store.lookupUserByEmail("teach@example.com"),
    ).resolves.toMatchObject({ userId: "u" });
    await expect(store.lookupUserByEmail("nobody@e.c")).resolves.toBeNull();
  });

  it("reads fixtures back", async () => {
    const store = createMemoryStaffStore({
      batches: [
        {
          id: "b",
          courseId: "c",
          courseName: "C",
          organizationId: "o",
          name: "B",
          joinCode: "J",
          isActive: true,
          memberCount: 1,
        },
      ],
      flags: [{ key: "X", enabled: true, description: "d" }],
    });
    await expect(store.batchInfo("b")).resolves.toMatchObject({ name: "B" });
    await expect(store.batchInfo("nope")).resolves.toBeNull();
    await expect(store.getFlags()).resolves.toHaveLength(1);
  });
});
