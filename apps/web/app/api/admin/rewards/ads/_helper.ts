/**
 * Rewarded-ads admin gate (M17). Teachers stay read-only by
 * construction — no teacher path exists here.
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../../lib/server/auth";
import type { Actor } from "../../../../../lib/server/staff";
import {
  createSupabaseRewardedStore,
  type RewardedStore,
} from "../../../../../lib/server/rewarded-store";
import { adminContext } from "../../_helper";
import { isRecord, toRewardedError } from "../../../rewards/ads/_helper";
import enErrors from "../../../../../messages/en/errors.json";

export interface RewardedAdminDeps {
  actor: Actor;
  store: RewardedStore;
}

export function isRewardedAdminActor(actor: Actor): boolean {
  return (
    actor.roles.includes("super_admin") || actor.roles.includes("admin")
  );
}

function forbiddenAds(): NextResponse {
  return NextResponse.json(
    { error: "FORBIDDEN", message: enErrors.permissionDenied },
    { status: 403 },
  );
}

export async function rewardedAdminContext(): Promise<
  RewardedAdminDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (!isRewardedAdminActor(ctx.actor)) return forbiddenAds();
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseRewardedStore(client) };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

function badRequest(): NextResponse {
  return NextResponse.json(
    { error: "MALFORMED", message: enErrors.malformedRequest },
    { status: 400 },
  );
}

export async function handleSetPolicy(
  body: unknown,
  deps: RewardedAdminDeps,
): Promise<Response> {
  if (!isRewardedAdminActor(deps.actor)) return forbiddenAds();
  if (!isRecord(body)) return badRequest();
  // Allow-listed keys only: admins tune values, never invent actions.
  const allowed = new Set([
    "enabled",
    "provider",
    "mock_allowed",
    "daily_limit",
    "cooldown_minutes",
    "max_rewards_per_day",
    "allow_coin_rewards",
    "recovery_max_days",
    "recovery_ads_per_day",
    "recovery_window_days",
    "recovery_cooldown_hours",
    "recovery_max_uses",
  ]);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) patch[k] = v;
  }
  if (typeof patch.provider === "string" &&
      patch.provider !== "mock" &&
      patch.provider !== "google_offerwall") {
    return badRequest();
  }
  try {
    await deps.store.setPolicy(patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toRewardedError(e);
  }
}

export async function handleSetDefinition(
  body: unknown,
  deps: RewardedAdminDeps,
): Promise<Response> {
  if (!isRewardedAdminActor(deps.actor)) return forbiddenAds();
  if (!isRecord(body)) return badRequest();
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || typeof body.enabled !== "boolean") {
    return badRequest();
  }
  try {
    await deps.store.setDefinition(slug, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toRewardedError(e);
  }
}

export async function handleSetFlag(
  body: unknown,
  deps: RewardedAdminDeps,
): Promise<Response> {
  if (!isRewardedAdminActor(deps.actor)) return forbiddenAds();
  if (!isRecord(body)) return badRequest();
  const key = typeof body.key === "string" ? body.key : "";
  if (
    (key !== "REWARDED_ADS_ENABLED" && key !== "GOOGLE_REWARDED_ENABLED") ||
    typeof body.enabled !== "boolean"
  ) {
    return badRequest();
  }
  try {
    await deps.store.setFlag(key, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toRewardedError(e);
  }
}

export async function handleFunnel(
  deps: RewardedAdminDeps,
): Promise<Response> {
  if (!isRewardedAdminActor(deps.actor)) return forbiddenAds();
  try {
    return NextResponse.json({ funnel: await deps.store.funnel() });
  } catch (e) {
    return toRewardedError(e);
  }
}
