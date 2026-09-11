import { describe, expect, it } from "vitest";
import { handleGetActor } from "./actor/route";
import { POST as logout } from "./logout/route";
import { handleRegister } from "./register/route";

describe("POST /api/auth/register", () => {
  const register = () => Promise.resolve("member-1");
  it("returns 401 without a session", async () => {
    const res = await handleRegister({}, { session: null, register });
    expect(res.status).toBe(401);
  });

  it("rejects malformed payloads and tracks", async () => {
    for (const body of [{}, { joinCode: "x" }, { joinCode: "x", rollNumber: "r", fullName: "n", skillTrack: "wizard" }]) {
      const res = await handleRegister(body, {
        session: { userId: "u" },
        register,
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("maps function errors to safe codes", async () => {
    const failing = (message: string) => () => Promise.reject(new Error(message));
    const taken = await handleRegister(
      { joinCode: "J", rollNumber: "R", fullName: "N", skillTrack: "beginner" },
      { session: { userId: "u" }, register: failing("ROLL_TAKEN") },
    );
    expect(taken.status).toBe(409);
    const dup = await handleRegister(
      { joinCode: "J", rollNumber: "R", fullName: "N", skillTrack: "beginner" },
      { session: { userId: "u" }, register: failing("ALREADY_ENROLLED") },
    );
    expect(await dup.json()).toMatchObject({ error: "ALREADY_ENROLLED" });
    const bad = await handleRegister(
      { joinCode: "J", rollNumber: "R", fullName: "N", skillTrack: "beginner" },
      { session: { userId: "u" }, register: failing("INVALID_JOIN_CODE") },
    );
    expect(bad.status).toBe(400);
    const other = await handleRegister(
      { joinCode: "J", rollNumber: "R", fullName: "N", skillTrack: "beginner" },
      { session: { userId: "u" }, register: failing("boom") },
    );
    expect(other.status).toBe(500);
    expect(await other.json()).toMatchObject({ error: "REGISTER_FAILED" });
  });

  it("returns 201 on success", async () => {
    const res = await handleRegister(
      { joinCode: "J", rollNumber: "R", fullName: "N", skillTrack: "expert" },
      { session: { userId: "u" }, register },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/auth/actor", () => {
  it("returns 401 anonymously, actor when known", async () => {
    expect(handleGetActor({ actor: null }).status).toBe(401);
    const res = handleGetActor({
      actor: {
        userId: "u",
        email: "e",
        roles: ["teacher"],
        adminOrgIds: [],
        status: "active",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ actor: { userId: "u" } });
  });
});

describe("POST /api/auth/logout", () => {
  it("always succeeds (idempotent)", async () => {
    const req = new Request("https://app.test/api/auth/logout", { method: "POST" });
    const res = await logout(req as never);
    expect(res.status).toBe(200);
  });
});
