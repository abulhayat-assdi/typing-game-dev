/**
 * GET /api/r2/signed-url?key=<r2-key>&expiresIn=<seconds>
 *
 * Issues time-boxed download URLs for PRIVATE R2 assets (avatars today).
 * Default-deny: 503 when R2 unconfigured, 401 without a session, 400 for
 * anything that is not a valid signable key. Public assets are never signed
 * (served from the CDN base URL instead) and arbitrary buckets/keys are
 * unreachable — every key passes @tap/r2 validation + SIGNABLE_PREFIXES.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { R2KeyError, isSignable, parseR2Key } from "@tap/r2";
import enErrors from "../../../../messages/en/errors.json";
import { getSession, unauthorized, type Session } from "../../../../lib/server/auth";
import {
  clampTtl,
  createR2Client,
  presignGetUrl,
  r2ConfigFromEnv,
} from "../../../../lib/server/r2";

export interface SignedUrlDeps {
  session: Session | null;
  configured: boolean;
  presign: (key: string, ttlSeconds: number) => Promise<string>;
}

export async function handleSignedUrlGet(
  req: NextRequest,
  deps: SignedUrlDeps,
): Promise<Response> {
  if (!deps.configured) {
    return NextResponse.json(
      { error: "R2_NOT_CONFIGURED", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  if (!deps.session) {
    return unauthorized(enErrors.unauthorizedDescription);
  }
  const params = req.nextUrl.searchParams;
  const rawKey = params.get("key") ?? "";
  const ttl = clampTtl(params.get("expiresIn"));
  try {
    const key = parseR2Key(rawKey);
    if (!isSignable(key)) {
      return NextResponse.json(
        { error: "INVALID_KEY", message: enErrors.fileNotAvailable },
        { status: 400 },
      );
    }
    const url = await deps.presign(key, ttl);
    return NextResponse.json({ url, key, expiresIn: ttl });
  } catch (err) {
    if (err instanceof R2KeyError) {
      return NextResponse.json(
        { error: "INVALID_KEY", message: enErrors.fileNotAvailable },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "SIGN_FAILED", message: enErrors.storageUnavailable },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  const config = r2ConfigFromEnv();
  if (!config) {
    return handleSignedUrlGet(req, {
      session,
      configured: false,
      presign: () => Promise.reject(new Error("R2 unconfigured")),
    });
  }
  const client = createR2Client(config);
  const bucket = config.bucket;
  return handleSignedUrlGet(req, {
    session,
    configured: true,
    presign: (key, ttl) => presignGetUrl(client, bucket, key, ttl),
  });
}
