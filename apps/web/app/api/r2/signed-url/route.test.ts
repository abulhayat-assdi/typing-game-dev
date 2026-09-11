import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { handleSignedUrlGet, type SignedUrlDeps } from "./route";

const SESSION = { userId: "u-1", email: null };

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, "https://app.test"));
}

function deps(over: Partial<SignedUrlDeps> = {}): SignedUrlDeps {
  return {
    session: SESSION,
    configured: true,
    presign: (key, ttl) =>
      Promise.resolve("https://signed.test/" + key + "?ttl=" + String(ttl)),
    ...over,
  };
}

describe("GET /api/r2/signed-url authorization boundary", () => {
  it("returns 401 without a session", async () => {
    const res = await handleSignedUrlGet(
      req("/api/r2/signed-url?key=avatars/u/x.webp"),
      deps({ session: null }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("returns 503 when R2 is unconfigured", async () => {
    const res = await handleSignedUrlGet(
      req("/api/r2/signed-url?key=avatars/u/x.webp"),
      deps({ configured: false }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "R2_NOT_CONFIGURED" });
  });

  it("rejects traversal, unknown prefixes and public assets with 400", async () => {
    for (const key of [
      "avatars/../../etc/passwd",
      "secrets/u/x.webp",
      "worlds/v/background.webp",
      "",
    ]) {
      const res = await handleSignedUrlGet(
        req(`/api/r2/signed-url?key=${encodeURIComponent(key)}`),
        deps(),
      );
      expect(res.status, key).toBe(400);
      expect(await res.json()).toMatchObject({ error: "INVALID_KEY" });
    }
  });

  it("signs valid private keys with a clamped TTL", async () => {
    const res = await handleSignedUrlGet(
      req("/api/r2/signed-url?key=avatars/u-1/thumb.webp&expiresIn=30"),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      key: "avatars/u-1/thumb.webp",
      expiresIn: 60,
    });
  });

  it("maps signer failures to 500, never leaking internals", async () => {
    const res = await handleSignedUrlGet(
      req("/api/r2/signed-url?key=avatars/u-1/thumb.webp"),
      deps({
        presign: () => Promise.reject(new Error("KMS exploded: secret=xyz")),
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe("SIGN_FAILED");
    expect(body.message).not.toContain("xyz");
  });
});
