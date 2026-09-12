/**
 * Boss persistence boundary (M12). Routes depend ONLY on BossStore.
 * Damage math, HP locking, phases and rewards live in SECURITY DEFINER
 * fns (0026); RLS reads scope visibility. The store never invents
 * damage and never trusts client-reported completion.
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

export interface BossDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  lore: string;
  difficulty: string;
  maxHp: number;
  status: string;
  version: number;
}

export interface BossPhase {
  position: number;
  name: string;
  hpFrom: number;
  hpTo: number;
  damageMultiplier: number;
}

export interface BossState {
  instance: {
    id: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    initialHp: number;
    currentHp: number;
    currentPhase: number;
    attemptsPerMember: number;
    defeatedAt: string | null;
  };
  boss: {
    slug: string;
    name: string;
    lore: string;
    difficulty: string;
    maxHp: number;
    artKey: string | null;
    rewardXp: number;
    rewardCoins: number;
  };
  phases: BossPhase[];
  mine: { damage: number; attemptsUsed: number } | null;
  top: { name: string; damage: number; isMe: boolean }[];
  feed: { kind: string; summary: Record<string, unknown>; createdAt: string }[];
}

export interface BossInstanceSummary {
  id: string;
  bossSlug: string;
  bossName: string;
  clanId: string;
  status: string;
  currentHp: number;
  initialHp: number;
  currentPhase: number;
  endAt: string | null;
}

export interface BossDefinitionInput {
  slug: string;
  name: string;
  description: string;
  lore: string;
  difficulty: string;
  maxHp: number;
  phases: {
    position: number;
    name: string;
    hpFrom: number;
    hpTo: number;
    multiplier: number;
    rules: Record<string, unknown>;
    games: string[];
  }[];
  rewardXp: number;
  rewardCoins: number;
}

export interface BossStore {
  listBosses(): Promise<BossDefinition[]>;
  listInstances(clanId: string): Promise<BossInstanceSummary[]>;
  /** All instances visible to the caller (RLS-scoped, any clan). */
  listMyInstances(): Promise<BossInstanceSummary[]>;
  getState(instanceId: string): Promise<BossState | null>;
  createInstance(
    bossId: string,
    clanId: string,
    startAt: string,
    endAt: string,
  ): Promise<string>;
  activateInstance(instanceId: string): Promise<void>;
  submitAttempt(instanceId: string, attemptId: string): Promise<number>;
  finalizeInstance(instanceId: string): Promise<Record<string, unknown>>;
  advanceInstance(instanceId: string): Promise<string>;
  createBoss(input: BossDefinitionInput): Promise<string>;
  updateBossDraft(id: string, patch: Record<string, unknown>): Promise<void>;
  setBossStatus(id: string, status: string): Promise<void>;
  /**
   * Latest validated own attempt for a game (strike candidate). Same
   * shared pattern as the mission store; fn_submit_boss_attempt enforces.
   */
  getLatestValidAttempt(
    gameSlug: string,
    userId: string,
  ): Promise<{ id: string } | null>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function mapStoreError(e: unknown): Error {
  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|row-level security|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND|BOSS_INACTIVE|CLAN_INACTIVE|NOT_PARTICIPANT|ATTEMPT_FORBIDDEN/i.test(message)) {
    return new NotFoundError(message);
  }
  if (
    /duplicate|unique|already|ALREADY|INVALID|MALFORMED|NOT_ACTIVE|OUTSIDE_WINDOW|NOT_VALIDATED|GAME_NOT_ALLOWED|BELOW_PHASE_BAR|ATTEMPT_LIMIT|DUPLICATE|IMMUTABLE|CLOSED/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseBossStore(client: SupabaseClient): BossStore {
  async function call<T>(
    fn: string,
    args: Record<string, unknown>,
    _failure: string,
  ): Promise<T> {
    const res = await client.rpc(fn, args);
    if (res.error) throw mapStoreError(res.error);
    return res.data as T;
  }

  return {
    async listBosses(): Promise<BossDefinition[]> {
      const res = await client
        .from("boss_definitions")
        .select("id, slug, name, description, lore, difficulty, max_hp, status, version")
        .order("max_hp", { ascending: true });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((b) => ({
          id: str(b.id),
          slug: str(b.slug),
          name: str(b.name),
          description: str(b.description),
          lore: str(b.lore),
          difficulty: str(b.difficulty, "normal"),
          maxHp: num(b.max_hp),
          status: str(b.status),
          version: num(b.version, 1),
        }))
        .filter((b) => b.id.length > 0);
    },

    async listInstances(clanId: string): Promise<BossInstanceSummary[]> {
      const res = await client
        .from("boss_instances")
        .select("id, boss_id, clan_id, status, initial_hp, current_hp, current_phase, end_at, boss_definitions(slug, name)")
        .eq("clan_id", clanId)
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => {
          if (typeof r.id !== "string") return null;
          const def: Record<string, unknown> = isRecord(r.boss_definitions)
            ? r.boss_definitions
            : {};
          return {
            id: r.id,
            bossSlug: str(def.slug),
            bossName: str(def.name),
            clanId: str(r.clan_id),
            status: str(r.status),
            currentHp: num(r.current_hp),
            initialHp: num(r.initial_hp),
            currentPhase: num(r.current_phase),
            endAt: typeof r.end_at === "string" ? r.end_at : null,
          };
        })
        .filter((r): r is BossInstanceSummary => r !== null);
    },

    async listMyInstances(): Promise<BossInstanceSummary[]> {
      const res = await client
        .from("boss_instances")
        .select("id, boss_id, clan_id, status, initial_hp, current_hp, current_phase, end_at, boss_definitions(slug, name)")
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => {
          if (typeof r.id !== "string") return null;
          const def: Record<string, unknown> = isRecord(r.boss_definitions)
            ? r.boss_definitions
            : {};
          return {
            id: r.id,
            bossSlug: str(def.slug),
            bossName: str(def.name),
            clanId: str(r.clan_id),
            status: str(r.status),
            currentHp: num(r.current_hp),
            initialHp: num(r.initial_hp),
            currentPhase: num(r.current_phase),
            endAt: typeof r.end_at === "string" ? r.end_at : null,
          };
        })
        .filter((r): r is BossInstanceSummary => r !== null);
    },

    async getState(instanceId: string): Promise<BossState | null> {
      const res = await client.rpc("fn_boss_state", { p_instance: instanceId });
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      const inst = isRecord(d.instance) ? d.instance : null;
      const boss = isRecord(d.boss) ? d.boss : null;
      if (!inst || !boss) return null;
      const reward = isRecord(boss.reward_profile) ? boss.reward_profile : {};
      const phases = Array.isArray(d.phases) ? d.phases : [];
      const top = Array.isArray(d.top) ? d.top : [];
      const feed = Array.isArray(d.feed) ? d.feed : [];
      const mine = isRecord(d.mine) ? d.mine : null;
      return {
        instance: {
          id: str(inst.id),
          status: str(inst.status),
          startAt: typeof inst.start_at === "string" ? inst.start_at : null,
          endAt: typeof inst.end_at === "string" ? inst.end_at : null,
          initialHp: num(inst.initial_hp),
          currentHp: num(inst.current_hp),
          currentPhase: num(inst.current_phase),
          attemptsPerMember: num(inst.attempts_per_member, 10),
          defeatedAt:
            typeof inst.defeated_at === "string" ? inst.defeated_at : null,
        },
        boss: {
          slug: str(boss.slug),
          name: str(boss.name),
          lore: str(boss.lore),
          difficulty: str(boss.difficulty, "normal"),
          maxHp: num(boss.max_hp),
          artKey: typeof boss.art_key === "string" ? boss.art_key : null,
          rewardXp: num(reward.xp),
          rewardCoins: num(reward.coins),
        },
        phases: phases.filter(isRecord).map((p, i) => ({
          position: num(p.position, i),
          name: str(p.name),
          hpFrom: num(p.hp_from),
          hpTo: num(p.hp_to),
          damageMultiplier: num(p.damage_multiplier, 1),
        })),
        mine: mine
          ? { damage: num(mine.damage), attemptsUsed: num(mine.attempts_used) }
          : null,
        top: top.filter(isRecord).map((t) => ({
          name: str(t.name, "Player"),
          damage: num(t.damage),
          isMe: t.is_me === true,
        })),
        feed: feed.filter(isRecord).map((f) => ({
          kind: str(f.kind),
          summary: isRecord(f.summary) ? f.summary : {},
          createdAt: str(f.created_at),
        })),
      };
    },

    async createInstance(
      bossId: string,
      clanId: string,
      startAt: string,
      endAt: string,
    ): Promise<string> {
      const id = await call<string>("fn_create_boss_instance", {
        p_boss: bossId,
        p_clan: clanId,
        p_start: startAt,
        p_end: endAt,
        p_attempts_per_member: 10,
      }, "CREATE_FAILED");
      if (typeof id !== "string") throw new ConflictError("CREATE_FAILED");
      return id;
    },

    async activateInstance(instanceId: string): Promise<void> {
      await call("fn_activate_boss_instance", { p_instance: instanceId }, "ACTIVATE_FAILED");
    },

    async submitAttempt(instanceId: string, attemptId: string): Promise<number> {
      const damage = await call<number>("fn_submit_boss_attempt", {
        p_instance: instanceId,
        p_attempt: attemptId,
      }, "SUBMIT_FAILED");
      if (typeof damage !== "number") throw new ConflictError("SUBMIT_FAILED");
      return damage;
    },

    async finalizeInstance(instanceId: string): Promise<Record<string, unknown>> {
      const res = await client.rpc("fn_finalize_boss", { p_instance: instanceId });
      if (res.error || !isRecord(res.data)) {
        throw mapStoreError(res.error ?? new Error("FINALIZE_FAILED"));
      }
      return res.data;
    },

    async advanceInstance(instanceId: string): Promise<string> {
      const status = await call<string>("fn_advance_boss", {
        p_instance: instanceId,
      }, "ADVANCE_FAILED");
      if (typeof status !== "string") throw new ConflictError("ADVANCE_FAILED");
      return status;
    },

    async createBoss(input: BossDefinitionInput): Promise<string> {
      const id = await call<string>("fn_create_boss", {
        p_def: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          lore: "",
          difficulty: "normal",
          max_hp: 1000,
          scoring_profile: { formula: "score_x_mult", multiplier: 1 },
          reward_profile: { xp: input.rewardXp, coins: input.rewardCoins },
          eligible: { min_level: 1 },
        },
      }, "CREATE_FAILED");
      if (typeof id !== "string") throw new ConflictError("CREATE_FAILED");
      for (const p of input.phases) {
        await call("fn_add_boss_phase", {
          p_boss: id,
          p_position: p.position,
          p_name: p.name,
          p_hp_from: p.hpFrom,
          p_hp_to: p.hpTo,
          p_constraints: { games: [] },
          p_multiplier: p.multiplier,
          p_rules: p.rules,
        }, "PHASE_FAILED");
      }
      return id;
    },

    async updateBossDraft(
      id: string,
      patch: Record<string, unknown>,
    ): Promise<void> {
      await call("fn_update_boss_draft", { p_boss: id, p_patch: patch }, "UPDATE_FAILED");
    },

    async setBossStatus(id: string, status: string): Promise<void> {
      await call("fn_set_boss_status", { p_boss: id, p_status: status }, "STATUS_FAILED");
    },

    async getLatestValidAttempt(
      gameSlug: string,
      userId: string,
    ): Promise<{ id: string } | null> {
      const res = await client
        .from("game_attempts")
        .select("id, games!inner(slug)")
        .eq("user_id", userId)
        .eq("status", "validated")
        .eq("games.slug", gameSlug)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const id = str(res.data.id);
      return id ? { id } : null;
    },
  };
}

interface MemoryBoss {
  def: BossDefinition;
  state: BossState;
}

/** Offline store for unit/API tests. */
export function createMemoryBossStore(
  seed: { bosses?: MemoryBoss[] } = {},
): BossStore & { __bosses: MemoryBoss[] } {
  const bosses: MemoryBoss[] = (seed.bosses ?? []).map((b) => ({
    def: { ...b.def },
    state: JSON.parse(JSON.stringify(b.state)) as BossState,
  }));
  const tick = (): Promise<void> => Promise.resolve();

  return {
    __bosses: bosses,

    async listBosses(): Promise<BossDefinition[]> {
      await tick();
      return bosses.map((b) => ({ ...b.def }));
    },

    async listInstances(): Promise<BossInstanceSummary[]> {
      await tick();
      return bosses.map((b) => ({
        id: b.state.instance.id,
        bossSlug: b.state.boss.slug,
        bossName: b.state.boss.name,
        clanId: "00000000-0000-4000-8000-000000000001",
        status: b.state.instance.status,
        currentHp: b.state.instance.currentHp,
        initialHp: b.state.instance.initialHp,
        currentPhase: b.state.instance.currentPhase,
        endAt: b.state.instance.endAt,
      }));
    },

    async listMyInstances(): Promise<BossInstanceSummary[]> {
      await tick();
      return bosses.map((b) => ({
        id: b.state.instance.id,
        bossSlug: b.state.boss.slug,
        bossName: b.state.boss.name,
        clanId: "00000000-0000-4000-8000-000000000001",
        status: b.state.instance.status,
        currentHp: b.state.instance.currentHp,
        initialHp: b.state.instance.initialHp,
        currentPhase: b.state.instance.currentPhase,
        endAt: b.state.instance.endAt,
      }));
    },

    async getState(instanceId: string): Promise<BossState | null> {
      await tick();
      const found = bosses.find((b) => b.state.instance.id === instanceId);
      return found
        ? (JSON.parse(JSON.stringify(found.state)) as BossState)
        : null;
    },

    async createInstance(
      bossId: string,
      clanId: string,
      startAt: string,
      endAt: string,
    ): Promise<string> {
      await tick();
      const n = String(bosses.length + 1).padStart(12, "0");
      const id = `00000000-0000-4000-8000-${n}`;
      const def = bosses[0]?.def;
      bosses.push({
        def: def
          ? { ...def, id: bossId }
          : {
              id: bossId,
              slug: "boss",
              name: "Boss",
              description: "",
              lore: "",
              difficulty: "normal",
              maxHp: 100,
              status: "active",
              version: 1,
            },
        state: {
          instance: {
            id,
            status: "scheduled",
            startAt,
            endAt,
            initialHp: 100,
            currentHp: 100,
            currentPhase: 0,
            attemptsPerMember: 10,
            defeatedAt: null,
          },
          boss: {
            slug: def?.slug ?? "boss",
            name: def?.name ?? "Boss",
            lore: "",
            difficulty: "normal",
            maxHp: 100,
            artKey: null,
            rewardXp: 20,
            rewardCoins: 2,
          },
          phases: [],
          mine: null,
          top: [],
          feed: [],
        },
      });
      return id;
    },

    async activateInstance(instanceId: string): Promise<void> {
      await tick();
      const found = bosses.find((b) => b.state.instance.id === instanceId);
      if (!found) throw new NotFoundError("NOT_FOUND");
      if (found.state.instance.status !== "scheduled") {
        throw new ConflictError("INVALID_STATE");
      }
      found.state.instance.status = "active";
    },

    async submitAttempt(instanceId: string): Promise<number> {
      await tick();
      const found = bosses.find((b) => b.state.instance.id === instanceId);
      if (!found) throw new NotFoundError("NOT_FOUND");
      if (found.state.instance.status !== "active") {
        throw new ConflictError("NOT_ACTIVE");
      }
      found.state.instance.currentHp = Math.max(
        found.state.instance.currentHp - 10,
        0,
      );
      if (found.state.instance.currentHp === 0) {
        found.state.instance.status = "defeated";
      }
      return 10;
    },

    async finalizeInstance(instanceId: string): Promise<Record<string, unknown>> {
      await tick();
      const found = bosses.find((b) => b.state.instance.id === instanceId);
      if (!found) throw new NotFoundError("NOT_FOUND");
      if (found.state.instance.status === "finalized") {
        return { instance_id: instanceId, already: true };
      }
      if (
        found.state.instance.status !== "defeated" &&
        found.state.instance.status !== "expired"
      ) {
        throw new ConflictError("INVALID_STATE");
      }
      found.state.instance.status = "finalized";
      return { instance_id: instanceId, outcome: "defeated" };
    },

    async advanceInstance(instanceId: string): Promise<string> {
      await tick();
      const found = bosses.find((b) => b.state.instance.id === instanceId);
      if (!found) throw new NotFoundError("NOT_FOUND");
      return found.state.instance.status;
    },

    async createBoss(): Promise<string> {
      await tick();
      const n = String(bosses.length + 1).padStart(12, "0");
      return `00000000-0000-4000-8000-${n}`;
    },

    async updateBossDraft(): Promise<void> {
      await tick();
    },

    async setBossStatus(): Promise<void> {
      await tick();
    },

    async getLatestValidAttempt(): Promise<{ id: string } | null> {
      await tick();
      return null;
    },
  };
}
