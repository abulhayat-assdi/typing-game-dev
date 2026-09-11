import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as overview } from "./overview/route";
import { GET as coursesGet, POST as coursesPost } from "./courses/route";
import { PATCH as coursePatch } from "./courses/[id]/route";
import { GET as batchesGet, POST as batchesPost } from "./batches/route";
import { PATCH as batchPatch } from "./batches/[id]/route";
import { GET as studentsGet } from "./students/route";
import { GET as userGet, PATCH as userPatch } from "./users/[id]/route";
import { GET as assignGet, POST as assignPost } from "./assignments/route";
import { DELETE as assignDelete } from "./assignments/[id]/route";
import { POST as rolesPost, DELETE as rolesDelete } from "./roles/route";
import { GET as flagsGet, PATCH as flagsPatch } from "./flags/[key]/route";
import { PATCH as gamePatch } from "./games/[slug]/route";

function req(method = "GET", body?: unknown): NextRequest {
  return new NextRequest(
    "https://app.test/x",
    body === undefined
      ? { method }
      : { method, body: JSON.stringify(body) },
  );
}

/**
 * Every admin handler fails closed without a session (getSession() throws
 * outside a request scope in tests → null → 401). Direct API access without
 * cookies can never reach store code.
 */
describe("admin API without session", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["overview", () => overview(req())],
    ["courses GET", () => coursesGet(req())],
    ["courses POST", () => coursesPost(req("POST", {}))],
    ["course PATCH", () => coursePatch(req("PATCH", {}), { params: { id: "x" } })],
    ["batches GET", () => batchesGet(req())],
    ["batches POST", () => batchesPost(req("POST", {}))],
    ["batch PATCH", () => batchPatch(req("PATCH", {}), { params: { id: "x" } })],
    ["students GET", () => studentsGet(req())],
    ["user GET", () => userGet(req(), { params: { id: "x" } })],
    ["user PATCH", () => userPatch(req("PATCH", {}), { params: { id: "x" } })],
    ["assignments GET", () => assignGet(req())],
    ["assignments POST", () => assignPost(req("POST", {}))],
    ["assignment DELETE", () => assignDelete(req("DELETE"), { params: { id: "x" } })],
    ["roles POST", () => rolesPost(req("POST", {}))],
    ["roles DELETE", () => rolesDelete(req("DELETE", {}))],
    ["flags GET", () => flagsGet(req())],
    ["flags PATCH", () => flagsPatch(req("PATCH", {}), { params: { key: "X" } })],
    ["game PATCH", () => gamePatch(req("PATCH", {}), { params: { slug: "x" } })],
  ];
  for (const [name, call] of cases) {
    it(`returns 401: ${name}`, async () => {
      const res = await call();
      expect(res.status, name).toBe(401);
    });
  }
});
