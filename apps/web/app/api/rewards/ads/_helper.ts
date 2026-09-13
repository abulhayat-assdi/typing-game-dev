/**
 * Shared rewarded-ads route gate (M17). Session + user-scoped store,
 * safe codes. Failure outcomes persist server-side and surface as
 * 409 codes — the browser never grants anything.
 */
import { NextResponse } from "next/server";
import {
  getSession,
  userDbClient,
  type Session,
} from "../../../../lib/server/auth";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseRewardedStore,
  type RewardedStore,
} from "../../../../lib/server/rewarded-store";
import enErrors from "../../../../messages/en/errors.json";

export interface RewardedContext {
  session: Session;
  store: RewardedStore;
}

export interface RewardedDeps {
  session: Session | null;
  store: RewardedStore | null;
}

export function toRewardedError(e: unknown): NextResponse {
  if (e instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (e instanceof ConflictError) {
    return NextResponse.json(
      { error: e.message, message: enErrors.valuesMismatch },
      { status: 409 },
    );
  }
  if (e instanceof NotFoundError) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { error: "FAILED", message: enErrors.genericDescription },
    { status: 500 },
  );
}

export async function rewardedContext(): Promise<
  RewardedContext | NextResponse
> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
      { status: 401 },
    );
  }
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { session, store: createSupabaseRewardedStore(client) };
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

export function validUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

export function unknownSession(): NextResponse {
  return NextResponse.json(
    { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
    { status: 404 },
  );
}

function gate(deps: RewardedDeps): RewardedContext | NextResponse {
  if (!deps.session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: enErrors.unauthorizedDescription },
      { status: 401 },
    );
  }
  if (!deps.store) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { session: deps.session, store: deps.store };
}

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

function strField(body: unknown, key: string): string {
  if (!isRecord(body)) return "";
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export async function handleOffer(
  body: unknown,
  deps: RewardedDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!isRecord(body)) return badRequest();
  const placement = strField(body, "placement") || "general";
  const rewardSlug = strField(body, "rewardSlug");
  if (!/^[a-z0-9-]{1,80}$/.test(rewardSlug)) return badRequest();
  try {
    const sessionId = await ctx.store.offer(placement, rewardSlug);
    return NextResponse.json({ ok: true, sessionId }, { status: 201 });
  } catch (e) {
    return toRewardedError(e);
  }
}

async function withSession(
  id: string,
  deps: RewardedDeps,
  run: (store: RewardedStore) => Promise<Response>,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownSession();
  try {
    return await run(ctx.store);
  } catch (e) {
    return toRewardedError(e);
  }
}

export async function handleOptIn(
  id: string,
  deps: RewardedDeps,
): Promise<Response> {
  return withSession(id, deps, async (store) => {
    const result = await store.optIn(id);
    if (result !== "ok") return toRewardedError(new ConflictError(result.toUpperCase()));
    return NextResponse.json({ ok: true });
  });
}

export async function handleCancel(
  id: string,
  deps: RewardedDeps,
): Promise<Response> {
  return withSession(id, deps, async (store) => {
    await store.cancel(id);
    return NextResponse.json({ ok: true });
  });
}

export async function handleStart(
  id: string,
  deps: RewardedDeps,
): Promise<Response> {
  return withSession(id, deps, async (store) => {
    const providerReference = await store.start(id);
    if (providerReference === "expired") {
      return toRewardedError(new ConflictError("EXPIRED"));
    }
    return NextResponse.json({ ok: true, providerReference });
  });
}

export async function handleComplete(
  id: string,
  body: unknown,
  deps: RewardedDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!validUuid(id)) return unknownSession();
  if (!isRecord(body)) return badRequest();
  // The client echoes the opaque provider reference issued at start;
  // the server validates it against the stored session. A bare
  // {completed: true} flag is never accepted (no such field read).
  const providerReference = strField(body, "providerReference");
  if (providerReference.length < 1 || providerReference.length > 120) {
    return badRequest();
  }
  try {
    const result = await ctx.store.complete(id, providerReference);
    if (result !== "completed") {
      return toRewardedError(new ConflictError(result.toUpperCase()));
    }
    const verified = await ctx.store.verify(id);
    if (verified !== "verified") {
      return toRewardedError(new ConflictError(verified.toUpperCase()));
    }
    const grantId = await ctx.store.grant(id);
    if (grantId.startsWith("denied:")) {
      return toRewardedError(new ConflictError(grantId.toUpperCase()));
    }
    return NextResponse.json({ ok: true, grantId });
  } catch (e) {
    return toRewardedError(e);
  }
}

export async function handleMySessions(
  deps: RewardedDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ sessions: await ctx.store.mySessions() });
  } catch (e) {
    return toRewardedError(e);
  }
}

export async function handleCatalog(
  deps: RewardedDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const [rewards, policy] = await Promise.all([
      ctx.store.rewardCatalog(),
      ctx.store.policy(),
    ]);
    return NextResponse.json({ rewards, policy });
  } catch (e) {
    return toRewardedError(e);
  }
}
