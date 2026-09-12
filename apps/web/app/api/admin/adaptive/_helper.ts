/**
 * Adaptive staff gate (M15). Teachers see batch aggregates only;
 * global aggregates stay admin-only. Learner key-level detail never
 * leaves the student's own scope (see adaptive-privacy.md).
 */
import { NextResponse } from "next/server";
import { userDbClient } from "../../../../lib/server/auth";
import type { Actor } from "../../../../lib/server/staff";
import {
  createSupabaseAdaptiveStore,
  type AdaptiveStore,
} from "../../../../lib/server/adaptive-store";
import { adminContext } from "../_helper";
import { toAdaptiveError } from "../../adaptive/_helper";
import enErrors from "../../../../messages/en/errors.json";

export interface AdaptiveStaffDeps {
  actor: Actor;
  store: AdaptiveStore;
}

export async function adaptiveStaffContext(): Promise<
  AdaptiveStaffDeps | NextResponse
> {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  return { actor: ctx.actor, store: createSupabaseAdaptiveStore(client) };
}

export function validUuid(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

function isTeacherOrAdmin(actor: Actor): boolean {
  return (
    actor.roles.includes("teacher") ||
    actor.roles.includes("admin") ||
    actor.roles.includes("super_admin")
  );
}

function isGlobalAdmin(actor: Actor): boolean {
  return (
    actor.roles.includes("admin") || actor.roles.includes("super_admin")
  );
}

export async function handleBatchSummary(
  batchId: string,
  deps: AdaptiveStaffDeps,
): Promise<Response> {
  if (!isTeacherOrAdmin(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  if (!validUuid(batchId)) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: enErrors.fileNotAvailable },
      { status: 404 },
    );
  }
  try {
    return NextResponse.json({
      summary: await deps.store.batchSummary(batchId),
    });
  } catch (e) {
    return toAdaptiveError(e);
  }
}

export async function handleGlobalSummary(
  deps: AdaptiveStaffDeps,
): Promise<Response> {
  if (!isGlobalAdmin(deps.actor)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: enErrors.permissionDenied },
      { status: 403 },
    );
  }
  try {
    return NextResponse.json({
      summary: await deps.store.globalSummary(),
    });
  } catch (e) {
    return toAdaptiveError(e);
  }
}
