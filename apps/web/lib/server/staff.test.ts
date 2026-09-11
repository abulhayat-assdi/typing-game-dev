import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthApiError,
  getCurrentActor,
  requireAdmin,
  requireRoles,
  requireSuperAdmin,
  requireTeacher,
} from "./staff";

interface FakeUser {
  id: string;
  email?: string | null;
}

function fakeClient(opts: {
  user?: FakeUser | null;
  roles?: Array<{ role: string; organization_id?: string | null }>;
  profile?: Record<string, unknown> | null;
}): SupabaseClient {
  const table = (rows: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: rows, error: null }),
      then: (resolve: (v: unknown) => void) => {
        resolve({ data: rows, error: null });
      },
    };
    return chain;
  };
  return {
    auth: {
      getUser: () =>
        Promise.resolve(
          opts.user
            ? { data: { user: opts.user }, error: null }
            : { data: { user: null }, error: { message: "no session" } },
        ),
    },
    from: (name: string) =>
      name === "user_roles" ? table(opts.roles ?? []) : table(opts.profile ?? null),
  } as unknown as SupabaseClient;
}

describe("getCurrentActor", () => {
  it("returns null without a session", async () => {
    await expect(getCurrentActor(fakeClient({}))).resolves.toBeNull();
  });

  it("assembles roles, org scopes and status", async () => {
    const actor = await getCurrentActor(
      fakeClient({
        user: { id: "u", email: "u@e.c" },
        roles: [
          { role: "teacher" },
          { role: "admin", organization_id: "org-1" },
          { role: "wizard" },
        ],
        profile: { account_status: "active" },
      }),
    );
    expect(actor).toMatchObject({
      userId: "u",
      email: "u@e.c",
      roles: ["teacher", "admin"],
      adminOrgIds: ["org-1"],
      status: "active",
    });
  });

  it("falls back safely on unknown status", async () => {
    const actor = await getCurrentActor(
      fakeClient({
        user: { id: "u" },
        roles: [],
        profile: { account_status: "limbo" },
      }),
    );
    expect(actor?.status).toBe("active");
    expect(actor?.email).toBeNull();
  });
});

describe("requireRoles", () => {
  const teacher = () =>
    fakeClient({ user: { id: "t" }, roles: [{ role: "teacher" }] });
  const student = () =>
    fakeClient({ user: { id: "s" }, roles: [{ role: "student" }] });

  it("passes matching roles, super_admin passes everything", async () => {
    await expect(requireRoles(teacher(), ["teacher"])).resolves.toMatchObject({
      userId: "t",
    });
    const su = fakeClient({ user: { id: "x" }, roles: [{ role: "super_admin" }] });
    await expect(requireRoles(su, ["admin"])).resolves.toMatchObject({
      userId: "x",
    });
  });

  it("rejects anonymous, wrong roles and suspended accounts", async () => {
    await expect(requireRoles(fakeClient({}), ["teacher"])).rejects.toMatchObject({
      status: 401,
    });
    await expect(requireRoles(student(), ["admin"])).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    const suspended = fakeClient({
      user: { id: "s" },
      roles: [{ role: "student" }],
      profile: { account_status: "suspended" },
    });
    await expect(requireRoles(suspended, ["student"])).rejects.toMatchObject({
      status: 403,
      code: "SUSPENDED",
    });
  });
});

describe("scoped gates", () => {
  it("requireTeacher allows teachers, denies plain admins", async () => {
    const teacher = fakeClient({ user: { id: "t" }, roles: [{ role: "teacher" }] });
    await expect(requireTeacher(teacher)).resolves.toBeDefined();
    const admin = fakeClient({
      user: { id: "a" },
      roles: [{ role: "admin", organization_id: "o" }],
    });
    await expect(requireTeacher(admin)).rejects.toBeInstanceOf(AuthApiError);
  });

  it("requireAdmin returns scopes, null for global", async () => {
    const admin = fakeClient({
      user: { id: "a" },
      roles: [{ role: "admin", organization_id: "o1" }],
    });
    await expect(requireAdmin(admin)).resolves.toMatchObject({
      orgIds: ["o1"],
    });
    const su = fakeClient({ user: { id: "x" }, roles: [{ role: "super_admin" }] });
    await expect(requireAdmin(su)).resolves.toMatchObject({ orgIds: null });
    const teacher = fakeClient({ user: { id: "t" }, roles: [{ role: "teacher" }] });
    await expect(requireAdmin(teacher)).rejects.toMatchObject({ status: 403 });
  });

  it("requireSuperAdmin is global-only", async () => {
    const su = fakeClient({ user: { id: "x" }, roles: [{ role: "super_admin" }] });
    await expect(requireSuperAdmin(su)).resolves.toBeDefined();
    const admin = fakeClient({
      user: { id: "a" },
      roles: [{ role: "admin", organization_id: "o" }],
    });
    await expect(requireSuperAdmin(admin)).rejects.toMatchObject({
      status: 403,
    });
  });
});
