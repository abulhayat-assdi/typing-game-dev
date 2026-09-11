/**
 * Competition persistence boundary (M8). Routes depend ONLY on
 * CompetitionStore — never on SQL or the Supabase client directly — so
 * competition/API tests run offline against the memory implementation while
 * production uses PostgREST RPCs (SECURITY DEFINER fns from 0014, RLS reads)
 * plus the 0015 leaderboard projection.
 *
 * Enforcement lives in the database (fn_can_manage_competition, RLS,
 * lifecycle guards). The store maps DB errors to typed errors; routes map
 * those to HTTP codes. Rewards flow through the M5 ledgers inside
 * fn_finalize_competition — the store never mints XP/coins itself.
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

export interface CompetitionCard {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  gameSlugs: string[];
  startsAt: string;
  endsAt: string;
  attemptLimit: number;
  rewardPreview: Record<string, unknown>;
}

export interface CompetitionDetail extends CompetitionCard {
  description: string;
  visibility: string;
  eligibility: Record<string, unknown>;
  scoring: Record<string, unknown>;
  attemptPolicy: string;
  rewardPolicy: Record<string, unknown>;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  myEntry: { status: string; batchId: string } | null;
}

export interface CompetitionDraftInput {
  slug: string;
  title: string;
  description: string;
  type: string;
  visibility: string;
  batchIds: string[];
  courseIds: string[];
  skillBands: string[];
  gameSlugs: string[];
  scoring: Record<string, unknown>;
  attemptPolicy: string;
  attemptLimit: number;
  rewardPolicy: Record<string, unknown>;
  startsAt: string;
  endsAt: string;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
}

export interface DraftPatch {
  title?: string;
  description?: string;
  eligibility?: Record<string, unknown>;
  scoring?: Record<string, unknown>;
  attemptPolicy?: string;
  attemptLimit?: number;
  rewardPolicy?: Record<string, unknown>;
  startsAt?: string;
  endsAt?: string;
  gameSlugs?: string[];
}

export interface LeaderboardRow {
  rank: number;
  displayName: string;
  batchTitle: string;
  score: number;
  wpm: number;
  accuracy: number;
  attempts: number;
  isMe: boolean;
}

export interface FinalizeSummary {
  participants: number;
  batches: number;
  rewards: number;
}

export interface CompetitionResult {
  scope: string;
  refId: string;
  rank: number;
  score: number;
  accuracy: number;
  wpm: number;
  attempts: number;
}

export interface CompetitionStore {
  listCompetitions(userId: string): Promise<CompetitionCard[]>;
  getCompetition(id: string, userId: string): Promise<CompetitionDetail | null>;
  createCompetition(input: CompetitionDraftInput): Promise<string>;
  updateDraft(id: string, patch: DraftPatch): Promise<void>;
  transitionCompetition(id: string, to: string): Promise<void>;
  finalizeCompetition(id: string): Promise<FinalizeSummary>;
  registerEntry(competitionId: string, userId: string): Promise<string>;
  attachAttempt(competitionId: string, attemptId: string): Promise<string>;
  /**
   * Latest VALIDATED own attempt for a game (attach candidate). Fail-soft:
   * null when none exists. All attach rules stay enforced by
   * fn_attach_attempt; this only locates the candidate.
   */
  getLatestValidAttempt(
    gameSlug: string,
    userId: string,
  ): Promise<{ id: string } | null>;
  getLeaderboard(competitionId: string): Promise<LeaderboardRow[]>;
  getResults(competitionId: string): Promise<CompetitionResult[]>;
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
  if (/NOT_FOUND/i.test(message)) return new NotFoundError(message);
  if (
    /duplicate|unique|already|ALREADY|INVALID|NOT_DRAFT|GAME_UNKNOWN/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

const CARD_SELECT =
  "id, slug, title, type, status, starts_at, ends_at, attempt_limit, reward_policy, competition_games(games(slug))";

function toCard(d: Record<string, unknown>): CompetitionCard | null {
  const id = str(d.id);
  const slug = str(d.slug);
  if (!id || !slug) return null;
  const links = Array.isArray(d.competition_games)
    ? d.competition_games.filter(isRecord)
    : [];
  const gameSlugs = links
    .map((l) => (isRecord(l.games) ? str(l.games.slug) : ""))
    .filter((s) => s.length > 0);
  return {
    id,
    slug,
    title: str(d.title),
    type: str(d.type),
    status: str(d.status),
    gameSlugs,
    startsAt: str(d.starts_at),
    endsAt: str(d.ends_at),
    attemptLimit: num(d.attempt_limit, 5),
    rewardPreview: isRecord(d.reward_policy) ? d.reward_policy : {},
  };
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseCompetitionStore(
  client: SupabaseClient,
): CompetitionStore {
  async function getEntry(
    competitionId: string,
  ): Promise<{ status: string; batchId: string } | null> {
    const res = await client
      .from("competition_entries")
      .select("status, batch_id")
      .eq("competition_id", competitionId)
      .maybeSingle();
    if (res.error || !isRecord(res.data)) return null;
    return { status: str(res.data.status), batchId: str(res.data.batch_id) };
  }

  return {
    async listCompetitions(): Promise<CompetitionCard[]> {
      const res = await client
        .from("competitions")
        .select(CARD_SELECT)
        .order("starts_at", { ascending: true });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).map(toCard).filter((c) => c !== null);
    },

    async getCompetition(
      id: string,
      _userId: string,
    ): Promise<CompetitionDetail | null> {
      const res = await client
        .from("competitions")
        .select(
          `${CARD_SELECT}, description, visibility, eligibility, scoring, attempt_policy, reward_policy, registration_starts_at, registration_ends_at`,
        )
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const card = toCard(res.data);
      if (!card) return null;
      return {
        ...card,
        description: str(res.data.description),
        visibility: str(res.data.visibility, "batch"),
        eligibility: isRecord(res.data.eligibility) ? res.data.eligibility : {},
        scoring: isRecord(res.data.scoring) ? res.data.scoring : {},
        attemptPolicy: str(res.data.attempt_policy, "BEST_SCORE"),
        rewardPolicy: isRecord(res.data.reward_policy)
          ? res.data.reward_policy
          : {},
        registrationStartsAt:
          typeof res.data.registration_starts_at === "string"
            ? res.data.registration_starts_at
            : null,
        registrationEndsAt:
          typeof res.data.registration_ends_at === "string"
            ? res.data.registration_ends_at
            : null,
        myEntry: await getEntry(id),
      };
    },

    async createCompetition(input: CompetitionDraftInput): Promise<string> {
      const res = await client.rpc("fn_create_competition", {
        p_slug: input.slug,
        p_title: input.title,
        p_description: input.description,
        p_type: input.type,
        p_visibility: input.visibility,
        p_batches: input.batchIds,
        p_courses: input.courseIds,
        p_skill_bands: input.skillBands,
        p_min_level: null,
        p_min_accuracy: null,
        p_min_wpm: null,
        p_games: input.gameSlugs,
        p_game_versions: null,
        p_scoring: input.scoring,
        p_tie_breakers: ["score", "accuracy", "wpm", "errors", "earliest"],
        p_attempt_policy: input.attemptPolicy,
        p_attempt_limit: input.attemptLimit,
        p_aggregate_strategy: null,
        p_aggregate_n: null,
        p_reward_policy: input.rewardPolicy,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_reg_start: input.registrationStartsAt,
        p_reg_end: input.registrationEndsAt,
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(
          res.error ?? new Error("CREATE_FAILED"),
        );
      }
      return res.data;
    },

    async updateDraft(id: string, patch: DraftPatch): Promise<void> {
      const res = await client.rpc("fn_update_competition_draft", {
        p_id: id,
        p_patch: patch,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async transitionCompetition(id: string, to: string): Promise<void> {
      const res = await client.rpc("fn_transition_competition", {
        p_id: id,
        p_to: to,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async finalizeCompetition(id: string): Promise<FinalizeSummary> {
      const res = await client.rpc("fn_finalize_competition", {
        p_competition: id,
      });
      if (res.error || !isRecord(res.data)) {
        throw mapStoreError(res.error ?? new Error("FINALIZE_FAILED"));
      }
      return {
        participants: num(res.data.participants),
        batches: num(res.data.batches),
        rewards: num(res.data.rewards),
      };
    },

    async registerEntry(
      _competitionId: string,
      _userId: string,
    ): Promise<string> {
      const res = await client.rpc("fn_register_entry", {
        p_competition: _competitionId,
      });      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("REGISTER_FAILED"));
      }
      return res.data;
    },

    async attachAttempt(
      competitionId: string,
      attemptId: string,
    ): Promise<string> {
      const res = await client.rpc("fn_attach_attempt", {
        p_competition: competitionId,
        p_attempt_id: attemptId,
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("ATTACH_FAILED"));
      }
      return res.data;
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

    async getLeaderboard(competitionId: string): Promise<LeaderboardRow[]> {
      const res = await client.rpc("fn_competition_leaderboard", {
        p_competition: competitionId,
      });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => ({
          rank: num(r.rank),
          displayName: str(r.display_name, "Player"),
          batchTitle: str(r.batch_title),
          score: num(r.score),
          wpm: num(r.wpm),
          accuracy: num(r.accuracy),
          attempts: num(r.attempts),
          isMe: r.is_me === true,
        }))
        .filter((r) => r.rank > 0);
    },

    async getResults(competitionId: string): Promise<CompetitionResult[]> {
      const res = await client
        .from("competition_results")
        .select("scope, ref_id, rank, score, accuracy, wpm, attempts")
        .eq("competition_id", competitionId)
        .order("rank", { ascending: true });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => ({
          scope: str(r.scope),
          refId: str(r.ref_id),
          rank: num(r.rank),
          score: num(r.score),
          accuracy: num(r.accuracy),
          wpm: num(r.wpm),
          attempts: num(r.attempts),
        }))
        .filter((r) => r.refId.length > 0);
    },
  };
}

interface MemoryCompetition extends CompetitionDetail {
  entries: { userId: string; status: string; batchId: string }[];
  board: LeaderboardRow[];
}

/** Offline store for unit/API tests. Mirrors lifecycle + idempotency rules. */
export function createMemoryCompetitionStore(
  seed: { competitions?: CompetitionDetail[] } = {},
): CompetitionStore & {
  __competitions: Map<string, MemoryCompetition>;
} {
  const comps = new Map<string, MemoryCompetition>();
  for (const c of seed.competitions ?? []) {
    comps.set(c.id, { ...c, entries: [], board: [] });
  }
  // Keeps memory methods genuinely async (tests assert rejections).
  const tick = (): Promise<void> => Promise.resolve();
  const isTerminal = (status: string): boolean =>
    status === "finalized" || status === "cancelled";

  return {
    __competitions: comps,

    async listCompetitions(): Promise<CompetitionCard[]> {
      await tick();
      return [...comps.values()];
    },

    async getCompetition(
      id: string,
      userId: string,
    ): Promise<CompetitionDetail | null> {
      await tick();
      const c = comps.get(id);
      if (!c) return null;
      const entry = c.entries.find((e) => e.userId === userId) ?? null;
      return {
        ...c,
        myEntry: entry
          ? { status: entry.status, batchId: entry.batchId }
          : null,
      };
    },

    async createCompetition(input: CompetitionDraftInput): Promise<string> {
      await tick();
      if (!input.slug.trim() || !input.title.trim()) {
        throw new ConflictError("MALFORMED");
      }
      // UUID-shaped so route-level id validation behaves like production.
      const n = String(comps.size + 1).padStart(12, "0");
      const id = `00000000-0000-4000-8000-${n}`;
      comps.set(id, {
        id,
        slug: input.slug,
        title: input.title,
        type: input.type,
        status: "draft",
        gameSlugs: input.gameSlugs,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        attemptLimit: input.attemptLimit,
        rewardPreview: input.rewardPolicy,
        description: input.description,
        visibility: input.visibility,
        eligibility: {
          batches: input.batchIds,
          courses: input.courseIds,
          skillBands: input.skillBands,
        },
        scoring: input.scoring,
        attemptPolicy: input.attemptPolicy,
        rewardPolicy: input.rewardPolicy,
        registrationStartsAt: input.registrationStartsAt,
        registrationEndsAt: input.registrationEndsAt,
        myEntry: null,
        entries: [],
        board: [],
      });
      return id;
    },

    async updateDraft(id: string, patch: DraftPatch): Promise<void> {
      await tick();
      const c = comps.get(id);
      if (!c) throw new NotFoundError("NOT_FOUND");
      if (c.status !== "draft") throw new ConflictError("NOT_DRAFT");
      if (patch.title !== undefined) c.title = patch.title;
      if (patch.description !== undefined) c.description = patch.description;
      if (patch.attemptLimit !== undefined) c.attemptLimit = patch.attemptLimit;
      if (patch.gameSlugs !== undefined) c.gameSlugs = patch.gameSlugs;
      if (patch.rewardPolicy !== undefined) {
        c.rewardPolicy = patch.rewardPolicy;
        c.rewardPreview = patch.rewardPolicy;
      }
    },

    async transitionCompetition(id: string, to: string): Promise<void> {
      await tick();
      const c = comps.get(id);
      if (!c) throw new NotFoundError("NOT_FOUND");
      if (isTerminal(c.status)) throw new ConflictError("INVALID_STATE");      c.status = to;
    },

    async finalizeCompetition(id: string): Promise<FinalizeSummary> {
      await tick();
      const c = comps.get(id);
      if (!c) throw new NotFoundError("NOT_FOUND");
      if (c.status === "finalized") throw new ConflictError("INVALID_STATE");
      c.status = "finalized";
      const ranked = [...c.entries].map((e, i) => ({
        rank: i + 1,
        displayName: e.userId,
        batchTitle: "",
        score: 100 - i,
        wpm: 40,
        accuracy: 95,
        attempts: 1,
        isMe: false,
      }));
      c.board = ranked;
      return {
        participants: c.entries.length,
        batches: 0,
        rewards: c.entries.length,
      };
    },

    async registerEntry(
      competitionId: string,
      userId: string,
    ): Promise<string> {
      await tick();
      const c = comps.get(competitionId);
      if (!c) throw new NotFoundError("NOT_FOUND");
      if (c.status !== "registration_open") {
        throw new ConflictError("REGISTRATION_CLOSED");
      }
      if (c.entries.some((e) => e.userId === userId)) {
        throw new ConflictError("ALREADY_REGISTERED");
      }
      const entryId = `entry-${String(c.entries.length + 1)}`;
      c.entries.push({ userId, status: "registered", batchId: "batch-1" });
      return entryId;
    },

    async attachAttempt(
      competitionId: string,
      attemptId: string,
    ): Promise<string> {
      await tick();
      const c = comps.get(competitionId);
      if (!c) throw new NotFoundError("NOT_FOUND");
      if (c.status !== "live") throw new ConflictError("NOT_LIVE");
      return `attached-${attemptId}`;
    },

    async getLatestValidAttempt(): Promise<{ id: string } | null> {
      await tick();
      return null;
    },

    async getLeaderboard(competitionId: string): Promise<LeaderboardRow[]> {
      await tick();
      return comps.get(competitionId)?.board ?? [];
    },

    async getResults(competitionId: string): Promise<CompetitionResult[]> {
      await tick();
      const c = comps.get(competitionId);
      if (!c || c.status !== "finalized") return [];
      return c.board.map((b) => ({
        scope: "participant",
        refId: b.displayName,
        rank: b.rank,
        score: b.score,
        accuracy: b.accuracy,
        wpm: b.wpm,
        attempts: b.attempts,
      }));
    },
  };
}
