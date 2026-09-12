/**
 * Shared adaptive-route gate (M15). Session + user-scoped store, safe
 * codes. Students read their own cached profile; heavy recompute runs
 * post-attempt and on sweep, never per render.
 */
import { NextResponse } from "next/server";
import { PROMPT_SETS } from "@tap/content";
import {
  buildPracticeDrill,
  type PracticeDrill,
} from "@tap/adaptive";
import {
  getSession,
  userDbClient,
  type Session,
} from "../../../lib/server/auth";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createSupabaseAdaptiveStore,
  type AdaptiveStore,
  type AdaptiveSummary,
} from "../../../lib/server/adaptive-store";
import enErrors from "../../../messages/en/errors.json";

export interface AdaptiveContext {
  session: Session;
  store: AdaptiveStore;
}

export interface AdaptiveDeps {
  session: Session | null;
  store: AdaptiveStore | null;
}

export function toAdaptiveError(e: unknown): NextResponse {
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

export async function adaptiveContext(): Promise<
  AdaptiveContext | NextResponse
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
  return { session, store: createSupabaseAdaptiveStore(client) };
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

function gate(deps: AdaptiveDeps): AdaptiveContext | NextResponse {
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

export async function handleGetSummary(
  deps: AdaptiveDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({
      summary: await ctx.store.getSummary(),
    });
  } catch (e) {
    return toAdaptiveError(e);
  }
}

export async function handleRefresh(
  deps: AdaptiveDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const result = await ctx.store.refreshProfile();
    return NextResponse.json({
      summary: await ctx.store.getSummary(),
      result,
    });
  } catch (e) {
    return toAdaptiveError(e);
  }
}

const FEEDBACK_EVENTS = new Set([
  "shown",
  "started",
  "completed",
  "abandoned",
  "skipped",
]);

export async function handleFeedback(
  body: unknown,
  deps: AdaptiveDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  const id = typeof body.recommendationId === "string" ? body.recommendationId : "";
  const event = typeof body.event === "string" ? body.event : "";
  if (!validUuid(id) || !FEEDBACK_EVENTS.has(event)) {
    return NextResponse.json(
      { error: "MALFORMED", message: enErrors.malformedRequest },
      { status: 400 },
    );
  }
  try {
    await ctx.store.sendFeedback(id, event);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toAdaptiveError(e);
  }
}

function contentLists(): { words: string[]; sentences: string[] } {
  const words: string[] = [];
  const sentences: string[] = [];
  for (const set of Object.values(PROMPT_SETS)) {
    if (!Array.isArray(set.items)) continue;
    const items = set.items.filter((x): x is string => typeof x === "string");
    if (set.kind === "words") words.push(...items);
    if (set.kind === "sentences") sentences.push(...items);
  }
  return { words, sentences };
}

export interface PracticePlan {
  top: AdaptiveSummary["recommendations"][number] | null;
  drill: PracticeDrill | null;
  actions: { key: string; gameSlug: string | null; label: string }[];
}

export function buildPracticePlan(summary: AdaptiveSummary | null): PracticePlan {
  if (!summary) return { top: null, drill: null, actions: [] };
  const top = summary.recommendations[0] ?? null;
  const weakKeys = summary.weaknesses
    .filter((w) => w.type === "key")
    .slice(0, 4)
    .map((w) => w.target);
  const drill =
    weakKeys.length > 0 ? buildPracticeDrill(weakKeys, contentLists()) : null;
  const byReason = (reason: string) =>
    summary.recommendations.find((r) => r.reason === reason)?.gameSlug ?? null;
  const sentenceGame =
    summary.recommendations.find((r) =>
      r.gameSlug.includes("sentence"),
    )?.gameSlug ?? top?.gameSlug ?? null;
  return {
    top,
    drill,
    actions: [
      { key: "need-most", gameSlug: top?.gameSlug ?? null, label: "Practice what I need most" },
      { key: "weak-keys", gameSlug: top?.gameSlug ?? null, label: "Practice weak keys" },
      { key: "accuracy", gameSlug: byReason("LOW_ACCURACY") ?? top?.gameSlug ?? null, label: "Practice accuracy" },
      { key: "speed", gameSlug: byReason("LOW_WPM") ?? top?.gameSlug ?? null, label: "Practice speed" },
      { key: "sentences", gameSlug: sentenceGame, label: "Practice sentence typing" },
    ],
  };
}

export async function handlePracticePlan(
  deps: AdaptiveDeps,
): Promise<Response> {
  const ctx = gate(deps);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const summary = await ctx.store.getSummary();
    return NextResponse.json({ plan: buildPracticePlan(summary) });
  } catch (e) {
    return toAdaptiveError(e);
  }
}
