import { describe, expect, it } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import {
  clampTtl,
  createR2Client,
  presignGetUrl,
  presignPutUrl,
  r2ConfigFromEnv,
} from "./r2";

// Offline-safe: presigning is pure HMAC — no network, dummy credentials.
function dummyClient(): { client: S3Client; bucket: string } {
  const client = createR2Client({
    endpoint: "https://test.r2.cloudflarestorage.com",
    region: "auto",
    accessKeyId: "TESTKEYID",
    secretAccessKey: "TESTSECRET",
    bucket: "test-bucket",
  });
  return { client, bucket: "test-bucket" };
}

describe("r2ConfigFromEnv", () => {
  it("fails closed without real credentials", () => {
    // .env.example ships placeholders only → unconfigured in test env.
    expect(r2ConfigFromEnv()).toBeNull();
  });
});

describe("clampTtl", () => {
  it("clamps into [60, 3600] with a sane default", () => {
    expect(clampTtl(undefined)).toBe(600);
    expect(clampTtl("300")).toBe(300);
    expect(clampTtl(30)).toBe(60);
    expect(clampTtl(99999)).toBe(3600);
    expect(clampTtl("abc")).toBe(600);
    expect(clampTtl(NaN)).toBe(600);
  });
});

describe("presignGetUrl", () => {
  it("issues a verifiable SigV4 URL for private keys", async () => {
    const { client, bucket } = dummyClient();
    const url = new URL(
      await presignGetUrl(client, bucket, "avatars/u-1/thumb.webp", 300),
    );
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toContain("avatars/u-1/thumb.webp");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe(
      "AWS4-HMAC-SHA256",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("TESTKEYID");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses invalid keys and public assets", async () => {
    const { client, bucket } = dummyClient();
    await expect(
      presignGetUrl(client, bucket, "../escape.webp", 300),
    ).rejects.toThrow(/Invalid R2 object key/);
    await expect(
      presignGetUrl(client, bucket, "worlds/v/bg.webp", 300),
    ).rejects.toThrow(/Refusing to sign public asset/);
  });
});

describe("presignPutUrl", () => {
  it("issues an upload URL binding the content type", async () => {
    const { client, bucket } = dummyClient();
    const url = new URL(
      await presignPutUrl(
        client,
        bucket,
        "avatars/u-1/original.png",
        "image/png",
        600,
      ),
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects bad content types and public keys", async () => {
    const { client, bucket } = dummyClient();
    await expect(
      presignPutUrl(client, bucket, "avatars/u/a.png", "bad type!", 600),
    ).rejects.toThrow(/Illegal content type/);
    await expect(
      presignPutUrl(client, bucket, "badges/b/icon.webp", "image/webp", 600),
    ).rejects.toThrow(/non-private/);
  });
});
