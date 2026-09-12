/**
 * War persistence boundary (M11). Routes depend ONLY on WarStore.
 * Lifecycle, eligibility snapshots, scoring and rewards live in
 * SECURITY DEFINER fns (0023-0024); RLS reads scope visibility.
 * War score never mutates clan XP.
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

export interface WarSummary {
  id: string;
  challengerClanId: string;
  defenderClanId: string;
  challengerName: string;
  defenderName: string;
  status: string;
  preparationStart: string | null;
  battleStart: string | null;
  battleEnd: string | null;
  myClanId: string | null;
}

export interface WarDetail extends WarSummary {
  scoringMode: string;
  playerPolicy: string;
  attemptsPerPlayer: number;
  gameSlugs: string[];
  myContribution: number;
  myAttempts: number;
}

export interface WarBoardRow {
  scope: string;
  clanId: string;
  displayName: string;
  score: number;
  attempts: number;
  isMe: boolean;
}

export interface ChallengeInput {
  defenderClanId: string;
  gameSlugs: string[];
  scope: string;
  prepHours: number;
  battleHours: number;
  attemptsPerPlayer: number;
}

export interface WarStore {
  listWars(): Promise<WarSummary[]>;
  getWar(id: string): Promise<WarDetail | null>;  challenge(input: ChallengeInput): Promise<string>;
  dispatch(id: string): Promise<void>;
  respond(id: string, accept: boolean): Promise<void>;
  cancel(id: string): Promise<void>;
  advance(id: string): Promise<string>;
  submitAttempt(id: string, attemptId: string): Promise<string>;
  sync(id: string): Promise<string>;
  finalize(id: string): Promise<Record<string, unknown>>;
  getBoard(id: string): Promise<WarBoardRow[]>;
  challengeable(): Promise<{ clanId: string; name: string }[]>;
  /**
   * Latest validated own attempt for a game (submit candidate). Same
   * shared pattern as the mission store; fn_submit_war_attempt enforces.
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

export function mapStoreError(e: unknown): Error {  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|row-level security|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND|NOT_CLAN_MISSION|NOT_PARTICIPANT|ATTEMPT_FORBIDDEN/i.test(message)) {
    return new NotFoundError(message);
  }
  if (
    /duplicate|unique|already|ALREADY|INVALID|MALFORMED|SELF_CHALLENGE|CLAN_INACTIVE|SCOPE_FORBIDDEN|NOT_LIVE|NOT_VALIDATED|OUTSIDE_WINDOW|GAME_NOT_ALLOWED|ATTEMPT_LIMIT|DUPLICATE|IMMUTABLE|CLOSED/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

const WAR_SELECT =
  "id, challenger_clan_id, defender_clan_id, status, preparation_start, battle_start, battle_end, scoring_profile, rules";

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseWarStore(client: SupabaseClient): WarStore {
  async function clanName(id: string): Promise<string> {
    const res = await client.from("clans").select("name").eq("id", id).maybeSingle();
    if (res.error || !isRecord(res.data)) return "";
    return str(res.data.name);
  }

  async function myClanId(): Promise<string | null> {
    const mem = await client
      .from("clan_members")
      .select("clan_id")
      .eq("status", "active")
      .maybeSingle();
    // NOTE: user scoping comes from RLS (own rows); the explicit filter
    // below would leak across users if RLS ever lapsed, so keep both.
    if (mem.error || !isRecord(mem.data)) return null;
    const id = str(mem.data.clan_id);
    return id || null;
  }

  async function toSummary(w: Record<string, unknown>): Promise<WarSummary | null> {
    const id = str(w.id);
    if (!id) return null;
    const [challengerName, defenderName, mine] = await Promise.all([
      clanName(str(w.challenger_clan_id)),
      clanName(str(w.defender_clan_id)),
      myClanId(),
    ]);
    return {
      id,
      challengerClanId: str(w.challenger_clan_id),
      defenderClanId: str(w.defender_clan_id),
      challengerName,
      defenderName,
      status: str(w.status),
      preparationStart:
        typeof w.preparation_start === "string" ? w.preparation_start : null,
      battleStart: typeof w.battle_start === "string" ? w.battle_start : null,
      battleEnd: typeof w.battle_end === "string" ? w.battle_end : null,
      myClanId: mine,
    };
  }

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
    async listWars(): Promise<WarSummary[]> {
      const res = await client
        .from("clan_wars")
        .select(WAR_SELECT)
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      const out: WarSummary[] = [];
      for (const w of res.data.filter(isRecord)) {
        const s = await toSummary(w);
        if (s) out.push(s);
      }
      return out;
    },

    async getWar(id: string): Promise<WarDetail | null> {
      const res = await client
        .from("clan_wars")
        .select(`${WAR_SELECT}, attempt_policy, eligibility, reward_policy`)
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const base = await toSummary(res.data);
      if (!base) return null;
      const scoring = isRecord(res.data.scoring_profile)
        ? res.data.scoring_profile
        : {};
      const rules = isRecord(res.data.rules) ? res.data.rules : {};
      const games = await client
        .from("clan_war_games")
        .select("game_id, games(slug)")
        .eq("war_id", id);
      const slugs =
        !games.error && Array.isArray(games.data)
          ? games.data
              .filter(isRecord)
              .map((g) => (isRecord(g.games) ? str(g.games.slug) : ""))
              .filter((s) => s.length > 0)
          : [];
      const me = await client.auth.getUser();
      const mine = await client
        .from("clan_war_contributions")
        .select("score, attempts")
        .eq("war_id", id)
        .eq("user_id", me.data.user?.id ?? "")
        .maybeSingle();
      const row = !mine.error && isRecord(mine.data) ? mine.data : null;
      return {
        ...base,
        scoringMode: str(scoring.mode, "sum"),
        playerPolicy: str(scoring.player_policy, "best_score"),
        attemptsPerPlayer: num(rules.attempts_per_player, 5),
        gameSlugs: slugs,
        myContribution: row ? num(row.score) : 0,
        myAttempts: row ? num(row.attempts) : 0,
      };
    },

    async challenge(input: ChallengeInput): Promise<string> {
      const id = await call<string>("fn_challenge_clan", {
        p_defender: input.defenderClanId,
        p_config: {
          game_slugs: input.gameSlugs,
          scope: input.scope,
          prep_hours: input.prepHours,
          battle_hours: input.battleHours,
          attempts_per_player: input.attemptsPerPlayer,
        },
      }, "CHALLENGE_FAILED");
      if (typeof id !== "string") throw new ConflictError("CHALLENGE_FAILED");
      return id;
    },

    async dispatch(id: string): Promise<void> {
      await call("fn_war_dispatch", { p_war: id }, "DISPATCH_FAILED");
    },

    async respond(id: string, accept: boolean): Promise<void> {
      await call("fn_respond_war", { p_war: id, p_accept: accept }, "RESPOND_FAILED");
    },

    async cancel(id: string): Promise<void> {
      await call("fn_cancel_war", { p_war: id }, "CANCEL_FAILED");
    },

    async advance(id: string): Promise<string> {
      const status = await call<string>("fn_advance_war", { p_war: id }, "ADVANCE_FAILED");
      if (typeof status !== "string") throw new ConflictError("ADVANCE_FAILED");
      return status;
    },

    async submitAttempt(id: string, attemptId: string): Promise<string> {
      const sub = await call<string>("fn_submit_war_attempt", {
        p_war: id,
        p_attempt: attemptId,
      }, "SUBMIT_FAILED");
      if (typeof sub !== "string") throw new ConflictError("SUBMIT_FAILED");
      return sub;
    },

    async sync(id: string): Promise<string> {
      const status = await call<string>("fn_sync_war", { p_war: id }, "SYNC_FAILED");
      if (typeof status !== "string") throw new ConflictError("SYNC_FAILED");
      return status;
    },

    async finalize(id: string): Promise<Record<string, unknown>> {
      const res = await client.rpc("fn_finalize_war", { p_war: id });
      if (res.error || !isRecord(res.data)) {
        throw mapStoreError(res.error ?? new Error("FINALIZE_FAILED"));
      }
      return res.data;
    },

    async getBoard(id: string): Promise<WarBoardRow[]> {
      const res = await client.rpc("fn_war_board", { p_war: id });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => ({
          scope: str(r.scope),
          clanId: str(r.clan_id),
          displayName: str(r.display_name),
          score: num(r.score),
          attempts: num(r.attempts),
          isMe: r.is_me === true,
        }))
        .filter((r) => r.displayName.length > 0);
    },

    async challengeable(): Promise<{ clanId: string; name: string }[]> {
      const res = await client.rpc("fn_challengeable_clans", {});
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => ({ clanId: str(r.clan_id), name: str(r.clan_name) }))
        .filter((r) => r.clanId.length > 0);
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

interface MemoryWar {
  summary: WarSummary;
  detail: WarDetail;
  board: WarBoardRow[];
}

const NEXT: Record<string, string[]> = {
  draft: ["challenge_sent", "cancelled"],
  challenge_sent: ["pending_response", "cancelled", "expired"],
  pending_response: ["accepted", "declined", "expired", "cancelled"],
  accepted: ["preparation", "cancelled"],
  preparation: ["live", "cancelled"],
  live: ["processing", "cancelled"],
  processing: ["finalized", "live"],
};

/** Offline store for unit/API tests (mirrors transition + submit rules). */
export function createMemoryWarStore(
  seed: { wars?: MemoryWar[] } = {},
): WarStore & { __wars: MemoryWar[] } {
  const wars: MemoryWar[] = (seed.wars ?? []).map((w) => ({
    summary: { ...w.summary },
    detail: { ...w.detail },
    board: w.board.map((b) => ({ ...b })),
  }));
  const tick = (): Promise<void> => Promise.resolve();
  const find = (id: string): MemoryWar | undefined =>
    wars.find((w) => w.summary.id === id);
  const move = (w: MemoryWar, to: string): void => {
    if (!(NEXT[w.summary.status] ?? []).includes(to)) {
      throw new ConflictError("INVALID_STATE");
    }
    w.summary.status = to;
    w.detail.status = to;
  };

  return {
    __wars: wars,

    async listWars(): Promise<WarSummary[]> {
      await tick();
      return wars.map((w) => ({ ...w.summary }));
    },

    async getWar(id: string): Promise<WarDetail | null> {
      await tick();
      const w = find(id);
      return w ? { ...w.detail } : null;
    },

    async challenge(input: ChallengeInput): Promise<string> {
      await tick();
      if (!input.defenderClanId) throw new ConflictError("MALFORMED");
      if (wars.some((w) => !["finalized", "cancelled", "declined", "expired"].includes(w.summary.status))) {
        throw new ConflictError("ALREADY_ACTIVE");
      }
      const n = String(wars.length + 1).padStart(12, "0");
      const id = `00000000-0000-4000-8000-${n}`;
      const summary: WarSummary = {
        id,
        challengerClanId: "00000000-0000-4000-8000-000000000001",
        defenderClanId: input.defenderClanId,
        challengerName: "Mine",
        defenderName: "Theirs",
        status: "challenge_sent",
        preparationStart: null,
        battleStart: null,
        battleEnd: null,
        myClanId: "00000000-0000-4000-8000-000000000001",
      };
      wars.push({
        summary,
        detail: {
          ...summary,
          scoringMode: "sum",
          playerPolicy: "best_score",
          attemptsPerPlayer: input.attemptsPerPlayer,
          gameSlugs: input.gameSlugs,
          myContribution: 0,
          myAttempts: 0,
        },
        board: [],
      });
      return id;
    },

    async dispatch(id: string): Promise<void> {
      await tick();
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      move(w, "pending_response");
    },

    async respond(id: string, accept: boolean): Promise<void> {
      await tick();
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      move(w, accept ? "accepted" : "declined");
    },

    async cancel(id: string): Promise<void> {
      await tick();
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      move(w, "cancelled");
    },

    async advance(id: string): Promise<string> {
      await tick();
      const order = ["accepted", "preparation", "live", "processing"];
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      const next = order[order.indexOf(w.summary.status) + 1];
      if (!next) throw new ConflictError("INVALID_STATE");
      move(w, next);
      return next;
    },

    async submitAttempt(id: string, attemptId: string): Promise<string> {
      await tick();
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      if (w.summary.status !== "live") throw new ConflictError("NOT_LIVE");
      if (w.detail.myAttempts >= w.detail.attemptsPerPlayer) {
        throw new ConflictError("ATTEMPT_LIMIT");
      }
      w.detail.myAttempts += 1;
      w.detail.myContribution += 10;
      return `sub-${attemptId}`;
    },

    async sync(id: string): Promise<string> {
      await tick();
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      return w.summary.status;
    },

    async finalize(id: string): Promise<Record<string, unknown>> {
      await tick();
      const w = find(id);
      if (!w) throw new NotFoundError("NOT_FOUND");
      if (w.summary.status === "finalized") {
        return { war_id: id, already: true };
      }
      move(w, "finalized");
      return { war_id: id, winner_clan_id: w.summary.challengerClanId };
    },

    async getBoard(id: string): Promise<WarBoardRow[]> {
      await tick();
      return find(id)?.board.map((b) => ({ ...b })) ?? [];
    },

    async challengeable(): Promise<{ clanId: string; name: string }[]> {
      await tick();
      return [
        { clanId: "00000000-0000-4000-8000-000000000002", name: "Rivals" },
      ];
    },

    async getLatestValidAttempt(): Promise<{ id: string } | null> {
      await tick();
      return null;
    },
  };
}
