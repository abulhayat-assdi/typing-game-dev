/**
 * Server-side R2 glue (M3). Secrets never leave this module boundary:
 * lib/server/* must never be imported by client components (asserted by
 * lib/server-boundary.test.ts).
 *
 * Presigning is offline-safe (pure HMAC-SHA256 over the request) so unit
 * tests run with dummy credentials and no network.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isSignable, parseR2Key } from "@tap/r2";
import { isR2Configured, serverEnv } from "./env";

export const MIN_SIGNED_TTL = 60;
export const MAX_SIGNED_TTL = 3600;

export interface R2Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Null when R2 is unconfigured (fail closed — callers return 503). */
export function r2ConfigFromEnv(): R2Config | null {
  if (!isR2Configured()) return null;
  return {
    endpoint: `https://${serverEnv.r2AccountId()}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId: serverEnv.r2AccessKeyId(),
    secretAccessKey: serverEnv.r2SecretAccessKey(),
    bucket: serverEnv.r2Bucket(),
  };
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/** Normalize + clamp a requested TTL (seconds) into [60, 3600]. */
export function clampTtl(input: unknown): number {
  const fallback = serverEnv.r2SignedUrlTtlSeconds();
  const n = typeof input === "string" ? Number(input) : input;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_SIGNED_TTL, Math.max(MIN_SIGNED_TTL, Math.floor(n)));
}

/** Presigned GET for a PRIVATE key. Throws on invalid/non-signable keys. */
export async function presignGetUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const valid = parseR2Key(key);
  if (!isSignable(valid)) {
    throw new Error(`Refusing to sign public asset "${valid}"`);
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: valid }),
    { expiresIn: clampTtl(expiresInSeconds) },
  );
}

/**
 * Presigned PUT foundation for uploads (wired to an upload route in a later
 * milestone). Same validation discipline as downloads; content type is part
 * of the signature so it cannot be swapped after issuance.
 */
export async function presignPutUrl(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds: number,
): Promise<string> {
  const valid = parseR2Key(key);
  if (!isSignable(valid)) {
    throw new Error(`Refusing upload to non-private asset "${valid}"`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9/+.=-]*$/.test(contentType)) {
    throw new Error(`Illegal content type "${contentType}"`);
  }
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: valid, ContentType: contentType }),
    { expiresIn: clampTtl(expiresInSeconds) },
  );
}
