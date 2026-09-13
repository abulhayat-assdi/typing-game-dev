/**
 * Rewarded-ads persistence boundary (M17). Routes depend ONLY on
 * RewardedStore — never on SQL directly — so ads/API tests run offline
 * against the memory implementation while production uses PostgREST
 * RPCs (SECURITY DEFINER fns from 0036, RLS reads).
 *
 * Enforcement lives in the database (flags, allow-listed rewards,
 * limits, ownership, exactly-once grants). Failure outcomes persist
 * server-side and are reported as codes — never raised away.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message = "CONFLICT") {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface RewardSession {
  id: string;
  provider: string;
  rewardSlug: string;
  placement: string;
  status: string;
  providerReference: string | null;
  createdAt: string;
}

export interface RewardDefinition {
  slug: string;
  kind: string;
  ref: string;
  amount: number;
  enabled: boolean;
}

export interface RewardPolicy {
  enabled: boolean;
  provider: string;
  mockAllowed: boolean;
  dailyLimit: number;
  cooldownMinutes: number;
  maxRewardsPerDay: number;
  allowCoinRewards: boolean;
}

export interface RewardedStore {
  offer(placement: string, rewardSlug: string): Promise<string>;
  optIn(sessionId: string): Promise<string>;
  cancel(sessionId: string): Promise<void>;
  start(sessionId: string): Promise<string>;
  complete(sessionId: string, providerReference: string): Promise<string>;
  verify(sessionId: string): Promise<string>;
  grant(sessionId: string): Promise<string>;
  mySessions(): Promise<RewardSession[]>;
  rewardCatalog(): Promise<RewardDefinition[]>;
  policy(): Promise<RewardPolicy | null>;
  setPolicy(patch: Record<string, unknown>): Promise<void>;
  setDefinition(slug: string, enabled: boolean): Promise<void>;
  setFlag(key: string, enabled: boolean): Promise<void>;
  funnel(): Promise<Record<string, unknown>>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function optStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

export function mapStoreError(e: unknown): Error {
  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|NOT_AUTHENTICATED|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND/i.test(message)) return new NotFoundError(message);
  if (
    /DISABLED|INVALID|LIMIT|COOLDOWN|CAP|EXPIRED|UNVERIFIABLE|FORGED|DENIED|RECOVER/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

function toSession(t: Record<string, unknown>): RewardSession | null {
  if (typeof t.id !== "string") return null;
  return {
    id: t.id,
    provider: str(t.provider, "mock"),
    rewardSlug: str(t.reward_slug),
    placement: str(t.placement, "general"),
    status: str(t.status, "offered"),
    providerReference: optStr(t.provider_reference),
    createdAt: str(t.created_at),
  };
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseRewardedStore(
  client: SupabaseClient,
): RewardedStore {
  async function call(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown }> {
    const res = await client.rpc(fn, args);
    if (res.error) throw mapStoreError(res.error);
    return { data: res.data };
  }

  return {
    async offer(placement, rewardSlug): Promise<string> {
      const { data } = await call("fn_rewarded_offer", {
        p_placement: placement,
        p_reward_slug: rewardSlug,
      });
      if (typeof data !== "string") throw new ConflictError("OFFER_FAILED");
      return data;
    },

    async optIn(sessionId): Promise<string> {
      const { data } = await call("fn_rewarded_opt_in", {
        p_session: sessionId,
      });
      if (typeof data !== "string") throw new ConflictError("OPT_IN_FAILED");
      return data;
    },

    async cancel(sessionId): Promise<void> {
      await call("fn_rewarded_cancel", { p_session: sessionId });
    },

    async start(sessionId): Promise<string> {
      const { data } = await call("fn_rewarded_start", {
        p_session: sessionId,
      });
      if (typeof data !== "string") throw new ConflictError("START_FAILED");
      return data;
    },

    async complete(sessionId, providerReference): Promise<string> {
      const { data } = await call("fn_rewarded_complete", {
        p_session: sessionId,
        p_event: { provider_reference: providerReference },
      });
      if (typeof data !== "string") throw new ConflictError("COMPLETE_FAILED");
      return data;
    },

    async verify(sessionId): Promise<string> {
      const { data } = await call("fn_rewarded_verify", {
        p_session: sessionId,
      });
      if (typeof data !== "string") throw new ConflictError("VERIFY_FAILED");
      return data;
    },

    async grant(sessionId): Promise<string> {
      const { data } = await call("fn_rewarded_grant", {
        p_session: sessionId,
      });
      if (typeof data !== "string") throw new ConflictError("GRANT_FAILED");
      return data;
    },

    async mySessions(): Promise<RewardSession[]> {
      const res = await client
        .from("rewarded_ad_sessions")
        .select(
          "id, provider, reward_slug, placement, status, provider_reference, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((t) => {
        const s = toSession(t);
        return s ? [s] : [];
      });
    },

    async rewardCatalog(): Promise<RewardDefinition[]> {
      const res = await client
        .from("rewarded_ad_reward_definitions")
        .select("slug, kind, ref, amount, enabled")
        .order("slug", { ascending: true });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .filter((t) => typeof t.slug === "string")
        .map((t) => ({
          slug: t.slug as string,
          kind: str(t.kind),
          ref: str(t.ref),
          amount: num(t.amount, 1),
          enabled: bool(t.enabled),
        }));
    },

    async policy(): Promise<RewardPolicy | null> {
      const res = await client
        .from("rewarded_ad_policy")
        .select(
          "enabled, provider, mock_allowed, daily_limit, cooldown_minutes, max_rewards_per_day, allow_coin_rewards",
        )
        .eq("id", 0)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      return {
        enabled: bool(d.enabled),
        provider: str(d.provider, "mock"),
        mockAllowed: bool(d.mock_allowed),
        dailyLimit: num(d.daily_limit, 5),
        cooldownMinutes: num(d.cooldown_minutes, 60),
        maxRewardsPerDay: num(d.max_rewards_per_day, 5),
        allowCoinRewards: bool(d.allow_coin_rewards),
      };
    },

    async setPolicy(patch): Promise<void> {
      await call("fn_set_rewarded_policy", { p_patch: patch });
    },

    async setDefinition(slug, enabled): Promise<void> {
      await call("fn_set_reward_definition", {
        p_slug: slug,
        p_enabled: enabled,
      });
    },

    async setFlag(key, enabled): Promise<void> {
      await call("fn_set_rewarded_flag", { p_key: key, p_enabled: enabled });
    },

    async funnel(): Promise<Record<string, unknown>> {
      const { data } = await call("fn_rewarded_funnel", {});
      if (!isRecord(data)) throw new ConflictError("FUNNEL_FAILED");
      return data;
    },
  };
}

interface MemorySession {
  id: string;
  rewardSlug: string;
  placement: string;
  status: string;
  providerReference: string | null;
  granted: boolean;
}

/** Offline store for unit/API tests (state machine without a provider). */
export function createMemoryRewardedStore(
  seed: { enabled?: boolean; sessions?: MemorySession[] } = {},
): RewardedStore & { __sessions: MemorySession[] } {
  let enabled = seed.enabled ?? true;
  const sessions: MemorySession[] = (seed.sessions ?? []).map((s) => ({ ...s }));
  let counter = sessions.length;
  const tick = (): Promise<void> => Promise.resolve();
  const need = (id: string): MemorySession => {
    const s = sessions.find((x) => x.id === id);
    if (!s) throw new NotFoundError("NOT_FOUND");
    return s;
  };
  const nextId = (): string => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  };

  return {
    __sessions: sessions,

    async offer(placement, rewardSlug): Promise<string> {
      await tick();
      if (!enabled) throw new ConflictError("DISABLED");
      if (rewardSlug !== "retry-token" && rewardSlug !== "streak-recovery-1d") {
        throw new ConflictError("INVALID_REWARD");
      }
      const id = nextId();
      sessions.push({
        id,
        rewardSlug,
        placement,
        status: "offered",
        providerReference: null,
        granted: false,
      });
      return id;
    },

    async optIn(sessionId): Promise<string> {
      await tick();
      const s = need(sessionId);
      if (s.status !== "offered") throw new ConflictError("INVALID_STATE");
      s.status = "opted_in";
      return "ok";
    },

    async cancel(sessionId): Promise<void> {
      await tick();
      const s = need(sessionId);
      if (s.status !== "offered" && s.status !== "opted_in") {
        throw new ConflictError("INVALID_STATE");
      }
      s.status = "cancelled";
    },

    async start(sessionId): Promise<string> {
      await tick();
      const s = need(sessionId);
      if (s.status !== "opted_in") throw new ConflictError("INVALID_STATE");
      s.status = "started";
      s.providerReference = `mock:${s.id}`;
      return s.providerReference;
    },

    async complete(sessionId, providerReference): Promise<string> {
      await tick();
      const s = need(sessionId);
      if (s.status !== "started") throw new ConflictError("INVALID_STATE");
      if (providerReference !== s.providerReference) {
        s.status = "failed";
        return "forged";
      }
      s.status = "completed";
      return "completed";
    },

    async verify(sessionId): Promise<string> {
      await tick();
      const s = need(sessionId);
      if (s.status !== "completed") throw new ConflictError("INVALID_STATE");
      s.status = "verified";
      return "verified";
    },

    async grant(sessionId): Promise<string> {
      await tick();
      const s = need(sessionId);
      if (s.status === "rewarded") return `grant:${s.id}`;
      if (s.status !== "verified") throw new ConflictError("INVALID_STATE");
      s.status = "rewarded";
      s.granted = true;
      return `grant:${s.id}`;
    },

    async mySessions(): Promise<RewardSession[]> {
      await tick();
      return sessions.map((s) => ({
        id: s.id,
        provider: "mock",
        rewardSlug: s.rewardSlug,
        placement: s.placement,
        status: s.status,
        providerReference: s.providerReference,
        createdAt: "",
      }));
    },

    async rewardCatalog(): Promise<RewardDefinition[]> {
      await tick();
      return [
        { slug: "retry-token", kind: "item", ref: "retry-token", amount: 1, enabled: true },
        { slug: "streak-recovery-1d", kind: "streak_recovery", ref: "1", amount: 1, enabled: true },
      ];
    },

    async policy(): Promise<RewardPolicy> {
      await tick();
      return {
        enabled,
        provider: "mock",
        mockAllowed: true,
        dailyLimit: 5,
        cooldownMinutes: 0,
        maxRewardsPerDay: 5,
        allowCoinRewards: false,
      };
    },

    async setPolicy(patch): Promise<void> {
      await tick();
      if (typeof patch.enabled === "boolean") enabled = patch.enabled;
    },

    async setDefinition(): Promise<void> {
      await tick();
    },

    async setFlag(): Promise<void> {
      await tick();
    },

    async funnel(): Promise<Record<string, unknown>> {
      await tick();
      return { events: {}, sessions: {}, grants: 0 };
    },
  };
}
