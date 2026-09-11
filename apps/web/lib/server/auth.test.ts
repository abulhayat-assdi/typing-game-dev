import { describe, expect, it } from "vitest";
import { getSession, type SupabaseClientLike } from "./auth";

function stubClient(
  user: { id: string; email?: string | null } | null,
  opts?: { error?: unknown; throws?: boolean },
): SupabaseClientLike {
  return {
    auth: {
      getUser: () => {
        if (opts?.throws) throw new Error("network down");
        return Promise.resolve({
          data: { user },
          error: opts?.error ?? null,
        });
      },
    },
  };
}

describe("getSession", () => {
  it("returns the session for a valid user", async () => {
    await expect(
      getSession({
        client: stubClient({ id: "u-1", email: "a@b.c" }),
      }),
    ).resolves.toEqual({ userId: "u-1", email: "a@b.c" });
  });

  it("normalizes missing email to null", async () => {
    await expect(
      getSession({ client: stubClient({ id: "u-1" }) }),
    ).resolves.toEqual({ userId: "u-1", email: null });
  });

  it("returns null without a session (logged out)", async () => {
    await expect(getSession({ client: stubClient(null) })).resolves.toBeNull();
  });

  it("returns null on Auth errors instead of throwing", async () => {
    await expect(
      getSession({ client: stubClient(null, { error: new Error("bad") }) }),
    ).resolves.toBeNull();
    await expect(
      getSession({ client: stubClient(null, { throws: true }) }),
    ).resolves.toBeNull();
  });

  it("returns null with no client (env unconfigured, fail closed)", async () => {
    await expect(
      getSession({ client: null }),
    ).resolves.toBeNull();
  });
});
