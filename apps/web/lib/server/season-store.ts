/**
 * Season persistence boundary (M13). Routes depend ONLY on SeasonStore.
 * Points derive from finalized source outcomes; rewards flow through M5
 * ledgers at finalize. The store never invents points or balances.
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

export interface SeasonSummary {
  id: string;
  slug: string;
  name: string;
  theme: string;
  status: string;
  startAt: string;
  endAt: string;
}

export interface SeasonBoardRow {
  rank: number;
  participantId: string;
  displayName: string;
  points: number;
  tier: string | null;
}

export interface SeasonDetail extends SeasonSummary {
  description: string;
  myPoints: number;
  myRank: number | null;
  myTier: string | null;
  studentBoard: SeasonBoardRow[];
  clanBoard: SeasonBoardRow[];
}

export interface SeasonCreateInput {
  slug: string;
  name: string;
  description: string;
  theme: string;
  startAt: string;
  endAt: string;
}

export interface SeasonStore {
  listSeasons(): Promise<SeasonSummary[]>;
  getSeason(id: string, userId: string): Promise<SeasonDetail | null>;
  getBoard(id: string, type: string): Promise<SeasonBoardRow[]>;
  createSeason(input: SeasonCreateInput): Promise<string>;
  updateSeasonDraft(id: string, patch: Record<string, unknown>): Promise<void>;
  scheduleSeason(id: string): Promise<void>;
  activateSeason(id: string): Promise<void>;
  cancelSeason(id: string): Promise<void>;
  advanceSeason(id: string): Promise<string>;
  setSource(id: string, source: string, enabled: boolean): Promise<void>;
  setTier(id: string, tier: string, minPoints: number): Promise<void>;
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
  if (
    /duplicate|unique|already|ALREADY|INVALID|MALFORMED|OVERLAP_FORBIDDEN|NOT_DRAFT/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  if (/FORBIDDEN|row-level security|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND|INELIGIBLE/i.test(message)) return new NotFoundError(message);
  return e instanceof Error ? e : new Error(message);
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseSeasonStore(
  client: SupabaseClient,
): SeasonStore {
  async function board(
    id: string,
    type: string,
  ): Promise<SeasonBoardRow[]> {
    const res = await client.rpc("fn_season_leaderboard", {
      p_season: id,
      p_type: type,
      p_limit: 100,
    });
    if (res.error || !Array.isArray(res.data)) return [];
    return res.data
      .filter(isRecord)
      .map((r) => ({
        rank: num(r.rank),
        participantId: str(r.participant_id),
        displayName: str(r.display_name, "Player"),
        points: num(r.points),
        tier: typeof r.tier === "string" ? r.tier : null,
      }))
      .filter((r) => r.participantId.length > 0);
  }

  return {
    async listSeasons(): Promise<SeasonSummary[]> {
      const res = await client
        .from("seasons")
        .select("id, slug, name, theme, status, start_at, end_at")
        .order("start_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((s) => ({
          id: str(s.id),
          slug: str(s.slug),
          name: str(s.name),
          theme: str(s.theme),
          status: str(s.status),
          startAt: str(s.start_at),
          endAt: str(s.end_at),
        }))
        .filter((s) => s.id.length > 0);
    },

    async getSeason(id: string, userId: string): Promise<SeasonDetail | null> {
      const res = await client
        .from("seasons")
        .select("id, slug, name, theme, description, status, start_at, end_at")
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      if (!str(d.id)) return null;
      const [studentBoard, clanBoard] = await Promise.all([
        board(id, "student"),
        board(id, "clan"),
      ]);
      const mine = studentBoard.find((r) => r.participantId === userId) ?? null;
      return {
        id: str(d.id),
        slug: str(d.slug),
        name: str(d.name),
        theme: str(d.theme),
        description: str(d.description),
        status: str(d.status),
        startAt: str(d.start_at),
        endAt: str(d.end_at),
        myPoints: mine ? mine.points : 0,
        myRank: mine ? mine.rank : null,
        myTier: mine ? mine.tier : null,
        studentBoard: studentBoard.slice(0, 20),
        clanBoard: clanBoard.slice(0, 20),
      };
    },

    async getBoard(id: string, type: string): Promise<SeasonBoardRow[]> {
      return board(id, type === "clan" ? "clan" : "student");
    },

    async createSeason(input: SeasonCreateInput): Promise<string> {
      const res = await client.rpc("fn_create_season", {
        p_def: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          theme: input.theme,
          start_at: input.startAt,
          end_at: input.endAt,
        },
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("CREATE_FAILED"));
      }
      return res.data;
    },

    async updateSeasonDraft(
      id: string,
      patch: Record<string, unknown>,
    ): Promise<void> {
      const res = await client.rpc("fn_update_season_draft", {
        p_season: id,
        p_patch: patch,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async scheduleSeason(id: string): Promise<void> {
      const res = await client.rpc("fn_schedule_season", { p_season: id });
      if (res.error) throw mapStoreError(res.error);
    },

    async activateSeason(id: string): Promise<void> {
      const res = await client.rpc("fn_activate_season", { p_season: id });
      if (res.error) throw mapStoreError(res.error);
    },

    async cancelSeason(id: string): Promise<void> {
      const res = await client.rpc("fn_cancel_season", { p_season: id });
      if (res.error) throw mapStoreError(res.error);
    },

    async advanceSeason(id: string): Promise<string> {
      const res = await client.rpc("fn_advance_season", { p_season: id });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("ADVANCE_FAILED"));
      }
      return res.data;
    },

    async setSource(id: string, source: string, enabled: boolean): Promise<void> {
      const res = await client.rpc("fn_set_season_source", {
        p_season: id,
        p_source: source,
        p_enabled: enabled,
        p_points: {},
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async setTier(id: string, tier: string, minPoints: number): Promise<void> {
      const res = await client.rpc("fn_set_season_tier", {
        p_season: id,
        p_tier: tier,
        p_min_points: minPoints,
        p_min_rank: null,
      });
      if (res.error) throw mapStoreError(res.error);
    },
  };
}

interface MemorySeason {
  summary: SeasonSummary;
  board: SeasonBoardRow[];
}

/** Offline store for unit/API tests. */
export function createMemorySeasonStore(
  seed: { seasons?: MemorySeason[] } = {},
): SeasonStore & { __seasons: MemorySeason[] } {
  const seasons: MemorySeason[] = (seed.seasons ?? []).map((s) => ({
    summary: { ...s.summary },
    board: s.board.map((b) => ({ ...b })),
  }));
  const tick = (): Promise<void> => Promise.resolve();
  const find = (id: string): MemorySeason | undefined =>
    seasons.find((s) => s.summary.id === id);

  return {
    __seasons: seasons,

    async listSeasons(): Promise<SeasonSummary[]> {
      await tick();
      return seasons.map((s) => ({ ...s.summary }));
    },

    async getSeason(id: string): Promise<SeasonDetail | null> {
      await tick();
      const s = find(id);
      if (!s) return null;
      return {
        ...s.summary,
        description: "",
        myPoints: s.board[0]?.points ?? 0,
        myRank: s.board[0]?.rank ?? null,
        myTier: s.board[0]?.tier ?? null,
        studentBoard: s.board.map((b) => ({ ...b })),
        clanBoard: [],
      };
    },

    async getBoard(id: string): Promise<SeasonBoardRow[]> {
      await tick();
      return find(id)?.board.map((b) => ({ ...b })) ?? [];
    },

    async createSeason(input: SeasonCreateInput): Promise<string> {
      await tick();
      if (!input.slug.trim() || !input.name.trim()) {
        throw new ConflictError("MALFORMED");
      }
      const n = String(seasons.length + 1).padStart(12, "0");
      const id = `00000000-0000-4000-8000-${n}`;
      seasons.push({
        summary: {
          id,
          slug: input.slug,
          name: input.name,
          theme: input.theme,
          status: "draft",
          startAt: input.startAt,
          endAt: input.endAt,
        },
        board: [],
      });
      return id;
    },

    async updateSeasonDraft(id: string, patch: Record<string, unknown>): Promise<void> {
      await tick();
      const s = find(id);
      if (!s) throw new NotFoundError("NOT_FOUND");
      if (s.summary.status !== "draft") throw new ConflictError("NOT_DRAFT");
      if (typeof patch.name === "string") s.summary.name = patch.name;
    },

    async scheduleSeason(id: string): Promise<void> {
      await tick();
      const s = find(id);
      if (!s) throw new NotFoundError("NOT_FOUND");
      if (s.summary.status !== "draft") throw new ConflictError("INVALID_STATE");
      s.summary.status = "scheduled";
    },

    async activateSeason(id: string): Promise<void> {
      await tick();
      const s = find(id);
      if (!s) throw new NotFoundError("NOT_FOUND");
      if (s.summary.status !== "scheduled") {
        throw new ConflictError("INVALID_STATE");
      }
      s.summary.status = "active";
    },

    async cancelSeason(id: string): Promise<void> {
      await tick();
      const s = find(id);
      if (!s) throw new NotFoundError("NOT_FOUND");
      if (s.summary.status !== "draft" && s.summary.status !== "scheduled") {
        throw new ConflictError("INVALID_STATE");
      }
      s.summary.status = "cancelled";
    },

    async advanceSeason(id: string): Promise<string> {
      await tick();
      const s = find(id);
      if (!s) throw new NotFoundError("NOT_FOUND");
      if (s.summary.status === "scheduled") s.summary.status = "active";
      else if (s.summary.status === "active") s.summary.status = "finalized";
      return s.summary.status;
    },

    async setSource(): Promise<void> {
      await tick();
    },

    async setTier(): Promise<void> {
      await tick();
    },
  };
}
