/**
 * Mission persistence boundary (M9). Routes depend ONLY on MissionStore —
 * never on SQL or the Supabase client directly — so mission/API tests run
 * offline against the memory implementation while production uses PostgREST
 * RPCs (SECURITY DEFINER fns from 0017-0018, RLS reads).
 *
 * Progress is always server-derived from validated attempts; rewards flow
 * through the M5 ledgers inside fn_sync_mission_instance. The store never
 * mints XP/coins and never trusts client-reported completion.
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

export interface MissionObjectiveState {
  position: number;
  kind: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface MissionInstance {
  instanceId: string;
  missionId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  period: string;
  periodStart: string;
  status: string;
  objectives: MissionObjectiveState[];
  rewardXp: number;
  rewardCoins: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MissionDefinitionInput {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  skillBand: string | null;
  period: string;
  objectives: { kind: string; target: Record<string, unknown> }[];
  gameSlugs: string[];
  worldIds: string[];
  rewardXp: number;
  rewardCoins: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface MissionAdminRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  version: number;
}

export interface MissionStore {
  /** Assign + sync + read today's set (daily, weekly, event). */
  getToday(userId: string): Promise<MissionInstance[]>;
  getInstance(instanceId: string): Promise<MissionInstance | null>;
  startMission(instanceId: string): Promise<void>;
  syncMissions(userId: string): Promise<number>;
  listMissions(): Promise<MissionAdminRow[]>;
  createMission(input: MissionDefinitionInput): Promise<string>;
  updateMissionDraft(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void>;
  setMissionStatus(id: string, status: string): Promise<void>;
  addObjective(
    missionId: string,
    kind: string,
    target: Record<string, unknown>,
  ): Promise<string>;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
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
  if (/NOT_FOUND/i.test(message)) return new NotFoundError(message);
  if (
    /duplicate|unique|already|ALREADY|INVALID|NOT_DRAFT|MALFORMED|PREREQUISITE|DUPLICATE/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

function toObjective(o: unknown, index: number): MissionObjectiveState {
  const r = isRecord(o) ? o : {};
  return {
    position: num(r.position, index),
    kind: str(r.kind),
    current: num(r.current),
    target: num(r.target, 1),
    completed: r.completed === true,
  };
}

function toInstance(r: Record<string, unknown>): MissionInstance | null {
  const instanceId = str(r.instance_id);
  const missionId = str(r.mission_id);
  if (!instanceId || !missionId) return null;
  const progress = isRecord(r.progress) ? r.progress : {};
  const list = Array.isArray(progress.objectives) ? progress.objectives : [];
  const reward = isRecord(r.reward_profile) ? r.reward_profile : {};
  return {
    instanceId,
    missionId,
    slug: str(r.slug),
    title: str(r.title),
    description: str(r.description),
    category: str(r.category),
    difficulty: str(r.difficulty, "beginner"),
    period: str(r.period),
    periodStart: str(r.period_start),
    status: str(r.status),
    objectives: list.map(toObjective),
    rewardXp: num(reward.xp),
    rewardCoins: num(reward.coins),
    startedAt: typeof r.started_at === "string" ? r.started_at : null,
    completedAt: typeof r.completed_at === "string" ? r.completed_at : null,
  };
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseMissionStore(
  client: SupabaseClient,
): MissionStore {
  async function readInstances(userId: string): Promise<MissionInstance[]> {
    const res = await client.rpc("fn_student_missions", { p_user: userId });
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
      .filter(isRecord)
      .map(toInstance)
      .filter((m): m is MissionInstance => m !== null);
  }

  return {
    async getToday(userId: string): Promise<MissionInstance[]> {
      await client.rpc("fn_assign_daily_missions", { p_user: userId });
      await client.rpc("fn_assign_weekly", { p_user: userId });
      await client.rpc("fn_sync_missions", { p_user: userId });
      return readInstances(userId);
    },

    async getInstance(instanceId: string): Promise<MissionInstance | null> {
      const res = await client
        .from("mission_instances")
        .select(
          "id, mission_id, period, period_start, status, progress, started_at, completed_at, missions(id, slug, title, description, category, difficulty, reward_profile)",
        )
        .eq("id", instanceId)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      const m: Record<string, unknown> = isRecord(d.missions)
        ? d.missions
        : {};
      const progress = isRecord(d.progress) ? d.progress : {};
      const list = Array.isArray(progress.objectives) ? progress.objectives : [];
      const reward = isRecord(m.reward_profile) ? m.reward_profile : {};
      if (typeof d.id !== "string" || typeof d.mission_id !== "string") {
        return null;
      }
      return {
        instanceId: d.id,
        missionId: d.mission_id,
        slug: str(m.slug),
        title: str(m.title),
        description: str(m.description),
        category: str(m.category),
        difficulty: str(m.difficulty, "beginner"),
        period: str(d.period),
        periodStart: str(d.period_start),
        status: str(d.status),
        objectives: list.map(toObjective),
        rewardXp: num(reward.xp),
        rewardCoins: num(reward.coins),
        startedAt: typeof d.started_at === "string" ? d.started_at : null,
        completedAt: typeof d.completed_at === "string" ? d.completed_at : null,
      };
    },

    async startMission(instanceId: string): Promise<void> {
      const res = await client.rpc("fn_start_mission", {
        p_instance: instanceId,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async syncMissions(userId: string): Promise<number> {
      const res = await client.rpc("fn_sync_missions", { p_user: userId });
      if (res.error || typeof res.data !== "number") {
        throw mapStoreError(res.error ?? new Error("SYNC_FAILED"));
      }
      return res.data;
    },

    async listMissions(): Promise<MissionAdminRow[]> {
      const res = await client
        .from("missions")
        .select("id, slug, title, category, status, version")
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((m) => ({
          id: str(m.id),
          slug: str(m.slug),
          title: str(m.title),
          category: str(m.category),
          status: str(m.status),
          version: num(m.version, 1),
        }))
        .filter((m) => m.id.length > 0);
    },

    async createMission(input: MissionDefinitionInput): Promise<string> {
      const res = await client.rpc("fn_create_mission", {
        p_def: {
          slug: input.slug,
          title: input.title,
          description: input.description,
          category: input.category,
          difficulty: input.difficulty,
          skill_band: input.skillBand,
          objective_type: input.objectives[0]?.kind ?? "GAMES_COMPLETED",
          target: input.objectives[0]?.target ?? {},
          game_constraints: {
            games: input.gameSlugs,
            worlds: input.worldIds,
          },
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          prerequisites: {},
          reward_profile: { xp: input.rewardXp, coins: input.rewardCoins },
          visibility: "batch",
        },
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("CREATE_FAILED"));
      }
      const id: string = res.data;
      for (const [i, o] of input.objectives.entries()) {
        const added = await client.rpc("fn_add_mission_objective", {
          p_mission: id,
          p_kind: o.kind,
          p_target: o.target,
          p_position: i,
        });
        if (added.error) throw mapStoreError(added.error);
      }
      return id;
    },

    async updateMissionDraft(
      id: string,
      patch: Record<string, unknown>,
    ): Promise<void> {
      const res = await client.rpc("fn_update_mission_draft", {
        p_mission: id,
        p_patch: patch,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async setMissionStatus(id: string, status: string): Promise<void> {
      const res = await client.rpc("fn_set_mission_status", {
        p_mission: id,
        p_status: status,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async addObjective(
      missionId: string,
      kind: string,
      target: Record<string, unknown>,
    ): Promise<string> {
      const res = await client.rpc("fn_add_mission_objective", {
        p_mission: missionId,
        p_kind: kind,
        p_target: target,
        p_position: null,
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("OBJECTIVE_FAILED"));
      }
      return res.data;
    },
  };
}

interface MemoryInstance extends MissionInstance {
  userId: string;
}

/** Offline store for unit/API tests. Mirrors status + idempotency rules. */
export function createMemoryMissionStore(
  seed: { instances?: MissionInstance[]; userId?: string } = {},
): MissionStore & { __instances: MemoryInstance[] } {
  const uid = seed.userId ?? "u-1";
  const instances: MemoryInstance[] = (seed.instances ?? []).map((m) => ({
    ...m,
    userId: uid,
    objectives: m.objectives.map((o) => ({ ...o })),
  }));
  const tick = (): Promise<void> => Promise.resolve();
  let adminSeq = 0;

  return {
    __instances: instances,

    async getToday(userId: string): Promise<MissionInstance[]> {
      await tick();
      return instances
        .filter((m) => m.userId === userId)
        .map(({ userId: _u, ...rest }) => rest);
    },

    async getInstance(instanceId: string): Promise<MissionInstance | null> {
      await tick();
      const found = instances.find((m) => m.instanceId === instanceId);
      if (!found) return null;
      const { userId: _u, ...rest } = found;
      return { ...rest, objectives: rest.objectives.map((o) => ({ ...o })) };
    },

    async startMission(instanceId: string): Promise<void> {
      await tick();
      const found = instances.find((m) => m.instanceId === instanceId);
      if (!found) throw new NotFoundError("NOT_FOUND");
      if (found.status !== "available") {
        throw new ConflictError("INVALID_STATE");
      }
      found.status = "active";
      found.startedAt = new Date().toISOString();
    },

    async syncMissions(userId: string): Promise<number> {
      await tick();
      return instances.filter(
        (m) => m.userId === userId && m.status === "active",
      ).length;
    },

    async listMissions(): Promise<MissionAdminRow[]> {
      await tick();
      return [];
    },

    async createMission(input: MissionDefinitionInput): Promise<string> {
      await tick();
      if (!input.slug.trim() || !input.title.trim()) {
        throw new ConflictError("MALFORMED");
      }
      adminSeq += 1;
      const n = String(adminSeq).padStart(12, "0");
      return `00000000-0000-4000-8000-${n}`;
    },

    async updateMissionDraft(): Promise<void> {
      await tick();
    },

    async setMissionStatus(): Promise<void> {
      await tick();
    },

    async addObjective(): Promise<string> {
      await tick();
      const n = String(instances.length + 1).padStart(12, "0");
      return `00000000-0000-4000-8000-${n}`;
    },
  };
}
