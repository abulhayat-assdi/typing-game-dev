/**
 * Tournament persistence boundary (M14). Routes depend ONLY on
 * TournamentStore — never on SQL or the Supabase client directly — so
 * tournament/API tests run offline against the memory implementation
 * while production uses PostgREST RPCs (SECURITY DEFINER fns from 0030,
 * RLS reads) plus the bracket projection below.
 *
 * Enforcement lives in the database (fn_require_tournament_admin, RLS,
 * lifecycle guards). The store maps DB errors to typed errors; routes map
 * those to HTTP codes. Rewards flow through the M5 ledgers inside
 * fn_finalize_tournament — the store never mints XP/coins itself, and it
 * never scores typing: match results are attested or derived from linked
 * war/competition contexts by the SQL layer.
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

export interface TournamentSummary {
  id: string;
  slug: string;
  name: string;
  theme: string;
  format: string;
  participantType: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
}

export interface TournamentSide {
  id: string;
  name: string;
}

export interface TournamentMatchView {
  id: string;
  roundNo: number;
  roundName: string;
  slot: number;
  participantA: TournamentSide | null;
  participantB: TournamentSide | null;
  status: string;
  sourceType: string;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  tieBreak: string | null;
}

export interface TournamentRoundView {
  roundNo: number;
  name: string;
  status: string;
  matches: TournamentMatchView[];
}

export interface TournamentPlacement {
  participantId: string;
  displayName: string;
  placement: number;
}

export interface TournamentDetail extends TournamentSummary {
  description: string;
  participantCount: number;
  myParticipantId: string | null;
  myStatus: string | null;
  rounds: TournamentRoundView[];
  results: TournamentPlacement[];
}

export interface TournamentCreateInput {
  slug: string;
  name: string;
  description: string;
  theme: string;
  format: string;
  participantType: string;
  startAt: string | null;
  endAt: string | null;
}

export interface TournamentStore {
  listTournaments(): Promise<TournamentSummary[]>;
  getTournament(id: string, userId: string): Promise<TournamentDetail | null>;
  getBracket(id: string): Promise<TournamentRoundView[]>;
  createTournament(input: TournamentCreateInput): Promise<string>;
  updateTournamentDraft(id: string, patch: Record<string, unknown>): Promise<void>;
  publishTournament(id: string): Promise<void>;
  closeRegistration(id: string): Promise<void>;
  cancelTournament(id: string): Promise<void>;
  registerTournament(id: string, actorUserId: string, clanId?: string): Promise<void>;
  withdrawTournament(id: string, actorUserId: string, clanId?: string): Promise<void>;
  seedTournament(id: string, method: string, order?: string[], seed?: number): Promise<number>;
  startTournament(id: string): Promise<void>;
  openMatch(id: string): Promise<void>;
  finalizeMatch(
    id: string,
    scoreA: number,
    scoreB: number,
    metrics?: Record<string, unknown>,
  ): Promise<string>;
  advanceTournament(id: string): Promise<string>;
  finalizeTournament(id: string): Promise<Record<string, unknown>>;
  syncSeason(id: string, seasonId: string): Promise<number>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function optStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function mapStoreError(e: unknown): Error {
  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|row-level security|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND|INELIGIBLE/i.test(message)) return new NotFoundError(message);
  if (
    /duplicate|unique|already|ALREADY|INVALID|MALFORMED|DUPLICATE|IMMUTABLE|CLOSED|LOCKED|CAP|FINAL|SOURCE_NOT/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

interface RawMatch {
  id: string;
  roundNo: number;
  roundName: string;
  roundStatus: string;
  slot: number;
  a: string | null;
  b: string | null;
  status: string;
  sourceType: string;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  tieBreak: string | null;
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseTournamentStore(
  client: SupabaseClient,
): TournamentStore {
  async function names(tournamentId: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const res = await client
      .from("tournament_participants")
      .select("participant_id, display_name")
      .eq("tournament_id", tournamentId);
    if (res.error || !Array.isArray(res.data)) return out;
    for (const row of res.data) {
      if (isRecord(row) && typeof row.participant_id === "string") {
        out.set(row.participant_id, str(row.display_name, "Player"));
      }
    }
    return out;
  }

  async function rawMatches(tournamentId: string): Promise<RawMatch[]> {
    const res = await client
      .from("tournament_matches")
      .select(
        "id, slot, participant_a, participant_b, status, source_type, winner_id, score_a, score_b, tie_break, tournament_rounds!inner(round_no, name, status)",
      )
      .eq("tournament_id", tournamentId)
      .order("slot", { ascending: true });
    if (res.error || !Array.isArray(res.data)) return [];
    const out: RawMatch[] = [];
    for (const row of res.data) {
      if (!isRecord(row)) continue;
      const round = isRecord(row.tournament_rounds) ? row.tournament_rounds : null;
      if (typeof row.id !== "string") continue;
      out.push({
        id: row.id,
        roundNo: typeof round?.round_no === "number" ? round.round_no : 0,
        roundName: str(round?.name),
        roundStatus: str(round?.status, "pending"),
        slot: typeof row.slot === "number" ? row.slot : 0,
        a: optStr(row.participant_a),
        b: optStr(row.participant_b),
        status: str(row.status, "pending"),
        sourceType: str(row.source_type, "manual"),
        winnerId: optStr(row.winner_id),
        scoreA: num(row.score_a),
        scoreB: num(row.score_b),
        tieBreak: optStr(row.tie_break),
      });
    }
    return out.sort((x, y) => x.roundNo - y.roundNo || x.slot - y.slot);
  }

  function toRounds(
    matches: RawMatch[],
    nameById: Map<string, string>,
  ): TournamentRoundView[] {
    const rounds = new Map<number, TournamentRoundView>();
    for (const m of matches) {
      let round = rounds.get(m.roundNo);
      if (!round) {
        round = { roundNo: m.roundNo, name: m.roundName, status: m.roundStatus, matches: [] };
        rounds.set(m.roundNo, round);
      }
      round.matches.push({
        id: m.id,
        roundNo: m.roundNo,
        roundName: m.roundName,
        slot: m.slot,
        participantA: m.a ? { id: m.a, name: nameById.get(m.a) ?? "Player" } : null,
        participantB: m.b ? { id: m.b, name: nameById.get(m.b) ?? "Player" } : null,
        status: m.status,
        sourceType: m.sourceType,
        winnerId: m.winnerId,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        tieBreak: m.tieBreak,
      });
    }
    return [...rounds.values()].sort((a, b) => a.roundNo - b.roundNo);
  }

  async function call(fn: string, args: Record<string, unknown>): Promise<{ data: unknown }> {
    const res = await client.rpc(fn, args);
    if (res.error) throw mapStoreError(res.error);
    return { data: res.data };
  }

  return {
    async listTournaments(): Promise<TournamentSummary[]> {
      const res = await client
        .from("tournaments")
        .select(
          "id, slug, name, theme, format, participant_type, status, start_at, end_at",
        )
        .order("start_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((t) => ({
          id: str(t.id),
          slug: str(t.slug),
          name: str(t.name),
          theme: str(t.theme),
          format: str(t.format),
          participantType: str(t.participant_type),
          status: str(t.status),
          startAt: optStr(t.start_at),
          endAt: optStr(t.end_at),
        }))
        .filter((t) => t.id.length > 0);
    },

    async getTournament(id: string, userId: string): Promise<TournamentDetail | null> {
      const res = await client
        .from("tournaments")
        .select(
          "id, slug, name, theme, description, format, participant_type, status, start_at, end_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      if (!str(d.id)) return null;
      const [nameById, matches] = await Promise.all([
        names(id),
        rawMatches(id),
      ]);
      const resultsRes = await client
        .from("tournament_results")
        .select("participant_id, display_name, placement")
        .eq("tournament_id", id)
        .order("placement", { ascending: true });
      const results: TournamentPlacement[] = [];
      if (!resultsRes.error && Array.isArray(resultsRes.data)) {
        for (const row of resultsRes.data) {
          if (
            isRecord(row) &&
            typeof row.participant_id === "string" &&
            typeof row.placement === "number"
          ) {
            results.push({
              participantId: row.participant_id,
              displayName: str(row.display_name, "Player"),
              placement: row.placement,
            });
          }
        }
      }
      const mineRes = await client
        .from("tournament_participants")
        .select("participant_id, status")
        .eq("tournament_id", id)
        .eq("participant_id", userId)
        .maybeSingle();
      const mine =
        !mineRes.error && isRecord(mineRes.data) ? mineRes.data : null;
      const countRes = await client
        .from("tournament_participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", id)
        .eq("status", "active");
      return {
        id: str(d.id),
        slug: str(d.slug),
        name: str(d.name),
        theme: str(d.theme),
        description: str(d.description),
        format: str(d.format),
        participantType: str(d.participant_type),
        status: str(d.status),
        startAt: optStr(d.start_at),
        endAt: optStr(d.end_at),
        participantCount:
          typeof countRes.count === "number" ? countRes.count : 0,
        myParticipantId:
          mine && typeof mine.participant_id === "string"
            ? mine.participant_id
            : null,
        myStatus: mine ? str(mine.status) : null,
        rounds: toRounds(matches, nameById),
        results,
      };
    },

    async getBracket(id: string): Promise<TournamentRoundView[]> {
      const [nameById, matches] = await Promise.all([
        names(id),
        rawMatches(id),
      ]);
      return toRounds(matches, nameById);
    },

    async createTournament(input: TournamentCreateInput): Promise<string> {
      const { data } = await call("fn_create_tournament", {
        p_def: {
          slug: input.slug,
          name: input.name,
          description: input.description,
          theme: input.theme,
          format: input.format,
          participant_type: input.participantType,
          start_at: input.startAt,
          end_at: input.endAt,
        },
      });
      if (typeof data !== "string") throw new ConflictError("CREATE_FAILED");
      return data;
    },

    async updateTournamentDraft(id, patch): Promise<void> {
      await call("fn_update_tournament_draft", { p_tournament: id, p_patch: patch });
    },

    async publishTournament(id): Promise<void> {
      await call("fn_publish_tournament", { p_tournament: id });
    },

    async closeRegistration(id): Promise<void> {
      await call("fn_close_registration", { p_tournament: id });
    },

    async cancelTournament(id): Promise<void> {
      await call("fn_cancel_tournament", { p_tournament: id });
    },

    // actorUserId is intentionally unused: fn_register_tournament derives
    // identity from auth.uid() server-side so forged IDs fail.
    async registerTournament(id, _actorUserId, clanId): Promise<void> {
      await call("fn_register_tournament", {
        p_tournament: id,
        p_clan: clanId ?? null,
      });
    },

    async withdrawTournament(id, _actorUserId, clanId): Promise<void> {
      await call("fn_withdraw_tournament", {
        p_tournament: id,
        p_clan: clanId ?? null,
      });
    },

    async seedTournament(id, method, order, seed): Promise<number> {
      const { data } = await call("fn_seed_tournament", {
        p_tournament: id,
        p_method: method,
        p_order: order ?? null,
        p_seed: seed ?? null,
      });
      if (typeof data !== "number") throw new ConflictError("SEED_FAILED");
      return data;
    },

    async startTournament(id): Promise<void> {
      await call("fn_start_tournament", { p_tournament: id });
    },

    async openMatch(id): Promise<void> {
      await call("fn_open_tmatch", { p_match: id });
    },

    async finalizeMatch(id, scoreA, scoreB, metrics): Promise<string> {
      const { data } = await call("fn_finalize_tmatch", {
        p_match: id,
        p_score_a: scoreA,
        p_score_b: scoreB,
        p_metrics: metrics ?? {},
      });
      if (typeof data !== "string") throw new ConflictError("FINALIZE_FAILED");
      return data;
    },

    async advanceTournament(id): Promise<string> {
      const { data } = await call("fn_advance_tournament", { p_tournament: id });
      if (typeof data !== "string") throw new ConflictError("ADVANCE_FAILED");
      return data;
    },

    async finalizeTournament(id): Promise<Record<string, unknown>> {
      const { data } = await call("fn_finalize_tournament", { p_tournament: id });
      if (!isRecord(data)) throw new ConflictError("FINALIZE_FAILED");
      return data;
    },

    async syncSeason(id, seasonId): Promise<number> {
      const { data } = await call("fn_sync_tournament_season", {
        p_tournament: id,
        p_season: seasonId,
      });
      if (typeof data !== "number") throw new ConflictError("SYNC_FAILED");
      return data;
    },
  };
}

interface MemoryParticipant {
  id: string;
  name: string;
  status: "active" | "withdrawn";
}

interface MemoryMatch {
  id: string;
  roundNo: number;
  slot: number;
  a: string | null;
  b: string | null;
  status: string;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
}

interface MemoryTournament {
  summary: TournamentSummary;
  description: string;
  participants: MemoryParticipant[];
  seeds: string[];
  matches: MemoryMatch[];
  rounds: number;
  results: TournamentPlacement[];
  finalizedCount: number;
}

/** Offline store for unit/API tests (single elimination, in memory). */
export function createMemoryTournamentStore(
  seed: { tournaments?: MemoryTournament[] } = {},
): TournamentStore & { __tournaments: MemoryTournament[] } {
  const tournaments: MemoryTournament[] = (seed.tournaments ?? []).map((t) => ({
    summary: { ...t.summary },
    description: t.description,
    participants: t.participants.map((p) => ({ ...p })),
    seeds: [...t.seeds],
    matches: t.matches.map((m) => ({ ...m })),
    rounds: t.rounds,
    results: t.results.map((r) => ({ ...r })),
    finalizedCount: t.finalizedCount,
  }));
  const tick = (): Promise<void> => Promise.resolve();
  const find = (id: string): MemoryTournament | undefined =>
    tournaments.find((t) => t.summary.id === id);
  const need = (id: string): MemoryTournament => {
    const t = find(id);
    if (!t) throw new NotFoundError("NOT_FOUND");
    return t;
  };
  let counter = tournaments.length;
  let matchCounter = 0;
  const nextMatchId = (): string => {
    matchCounter += 1;
    return `aaaaaaaa-0000-4000-8000-${String(matchCounter).padStart(12, "0")}`;
  };

  function roundName(round: number, total: number): string {
    const fromEnd = total - round;
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1) return "Semifinals";
    if (fromEnd === 2) return "Quarterfinals";
    return `Round of ${String(2 ** (fromEnd + 1))}`;
  }

  function buildBracket(t: MemoryTournament): void {
    const active = t.participants.filter((p) => p.status === "active");
    const order = t.seeds.length > 0 ? t.seeds : active.map((p) => p.id);
    let slots = 1;
    while (slots < order.length) slots *= 2;
    let rounds = 0;
    let size = 1;
    while (size < slots) {
      size *= 2;
      rounds += 1;
    }
    t.rounds = rounds;
    let positions = [1];
    let s = 1;
    while (s < slots) {
      s *= 2;
      const next: number[] = [];
      for (const p of positions) next.push(p, s + 1 - p);
      positions = next;
    }
    const placed: (string | null)[] = positions.map(
      (seed) => order[seed - 1] ?? null,
    );
    t.matches = [];
    for (let i = 0; i < placed.length; i += 2) {
      const a = placed[i] ?? null;
      const b = placed[i + 1] ?? null;
      const byeToA = a && !b ? a : null;
      const byeToB = !a && b ? b : null;
      const bye: string | null = byeToA ?? byeToB;
      t.matches.push({
        id: nextMatchId(),
        roundNo: 1,
        slot: t.matches.length + 1,
        a,
        b,
        status: bye ? "bye" : "pending",
        winnerId: bye,
        scoreA: null,
        scoreB: null,
      });
    }
    for (let r = 2; r <= rounds; r += 1) {
      const count = slots / 2 ** r;
      for (let k = 1; k <= count; k += 1) {
        let a: string | null = null;
        let b: string | null = null;
        if (r === 2) {
          const left = t.matches.find((m) => m.roundNo === 1 && m.slot === 2 * k - 1);
          const right = t.matches.find((m) => m.roundNo === 1 && m.slot === 2 * k);
          if (left?.status === "bye") a = left.winnerId;
          if (right?.status === "bye") b = right.winnerId;
        }
        t.matches.push({
          id: nextMatchId(),
          roundNo: r,
          slot: k,
          a,
          b,
          status: "pending",
          winnerId: null,
          scoreA: null,
          scoreB: null,
        });
      }
    }
  }

  function toRounds(t: MemoryTournament): TournamentRoundView[] {
    const byName = new Map(t.participants.map((p) => [p.id, p.name]));
    const rounds = new Map<number, TournamentRoundView>();
    for (const m of t.matches) {
      let round = rounds.get(m.roundNo);
      if (!round) {
        round = {
          roundNo: m.roundNo,
          name: roundName(m.roundNo, t.rounds),
          status: "pending",
          matches: [],
        };
        rounds.set(m.roundNo, round);
      }
      round.matches.push({
        id: m.id,
        roundNo: m.roundNo,
        roundName: round.name,
        slot: m.slot,
        participantA: m.a ? { id: m.a, name: byName.get(m.a) ?? "Player" } : null,
        participantB: m.b ? { id: m.b, name: byName.get(m.b) ?? "Player" } : null,
        status: m.status,
        sourceType: "manual",
        winnerId: m.winnerId,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        tieBreak: null,
      });
    }
    return [...rounds.values()].sort((a, b) => a.roundNo - b.roundNo);
  }

  function decide(a: string, b: string, sa: number, sb: number): string {
    if (sa !== sb) return sa > sb ? a : b;
    return a < b ? a : b;
  }

  return {
    __tournaments: tournaments,

    async listTournaments(): Promise<TournamentSummary[]> {
      await tick();
      return tournaments.map((t) => ({ ...t.summary }));
    },

    async getTournament(id: string, userId: string): Promise<TournamentDetail | null> {
      await tick();
      const t = find(id);
      if (!t) return null;
      const mine = t.participants.find((p) => p.id === userId) ?? null;
      return {
        ...t.summary,
        description: t.description,
        participantCount: t.participants.filter((p) => p.status === "active").length,
        myParticipantId: mine ? mine.id : null,
        myStatus: mine ? mine.status : null,
        rounds: toRounds(t),
        results: t.results.map((r) => ({ ...r })),
      };
    },

    async getBracket(id: string): Promise<TournamentRoundView[]> {
      await tick();
      return toRounds(need(id));
    },

    async createTournament(input: TournamentCreateInput): Promise<string> {
      await tick();
      if (!input.slug.trim() || !input.name.trim()) {
        throw new ConflictError("MALFORMED");
      }
      if (input.format !== "single_elimination") {
        throw new ConflictError("FORMAT_NOT_YET_IMPLEMENTED");
      }
      if (input.participantType !== "clan" && input.participantType !== "student") {
        throw new ConflictError("UNSUPPORTED_PARTICIPANT_TYPE");
      }
      counter += 1;
      const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
      tournaments.push({
        summary: {
          id,
          slug: input.slug,
          name: input.name,
          theme: input.theme,
          format: input.format,
          participantType: input.participantType,
          status: "draft",
          startAt: input.startAt,
          endAt: input.endAt,
        },
        description: input.description,
        participants: [],
        seeds: [],
        matches: [],
        rounds: 0,
        results: [],
        finalizedCount: 0,
      });
      return id;
    },

    async updateTournamentDraft(id, patch): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "draft") throw new ConflictError("NOT_DRAFT");
      if (typeof patch.name === "string" && patch.name) t.summary.name = patch.name;
    },

    async publishTournament(id): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "draft") throw new ConflictError("INVALID_STATE");
      t.summary.status = "registration_open";
    },

    async closeRegistration(id): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "registration_open") {
        throw new ConflictError("INVALID_STATE");
      }
      t.summary.status = "registration_closed";
    },

    async cancelTournament(id): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.status === "finalized" || t.summary.status === "processing") {
        throw new ConflictError("INVALID_STATE");
      }
      t.summary.status = "cancelled";
      for (const m of t.matches) {
        if (m.status !== "finalized" && m.status !== "bye") m.status = "cancelled";
      }
    },

    async registerTournament(id, actorUserId, clanId): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "registration_open") {
        throw new ConflictError("REGISTRATION_CLOSED");
      }
      const pid = t.summary.participantType === "clan" ? (clanId ?? "") : actorUserId;
      if (!pid) throw new ConflictError("MALFORMED");
      const existing = t.participants.find((p) => p.id === pid);
      if (existing) {
        if (existing.status === "active") throw new ConflictError("DUPLICATE");
        existing.status = "active";
        return;
      }
      t.participants.push({ id: pid, name: pid, status: "active" });
    },

    async withdrawTournament(id, actorUserId, clanId): Promise<void> {
      await tick();
      const t = need(id);
      if (
        t.summary.status !== "registration_open" &&
        t.summary.status !== "registration_closed"
      ) {
        throw new ConflictError("REGISTRATION_LOCKED");
      }
      const pid = t.summary.participantType === "clan" ? (clanId ?? "") : actorUserId;
      const existing = t.participants.find((p) => p.id === pid);
      if (!existing || existing.status !== "active") {
        throw new NotFoundError("NOT_FOUND");
      }
      existing.status = "withdrawn";
    },

    async seedTournament(id, method, order): Promise<number> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "registration_closed") {
        throw new ConflictError("INVALID_STATE");
      }
      const active = t.participants.filter((p) => p.status === "active").map((p) => p.id);
      if (method === "manual") {
        if (!order || order.length !== active.length) {
          throw new ConflictError("MALFORMED");
        }
        const sorted = [...order].sort();
        if (sorted.some((v, i) => v !== [...active].sort()[i])) {
          throw new ConflictError("MALFORMED");
        }
        t.seeds = [...order];
      } else if (method === "random" || method === "season_ranking") {
        t.seeds = [...active].sort();
      } else {
        throw new ConflictError("MALFORMED");
      }
      if (t.seeds.length < 2) throw new ConflictError("TOO_FEW_PARTICIPANTS");
      buildBracket(t);
      t.summary.status = "seeded";
      return t.seeds.length;
    },

    async startTournament(id): Promise<void> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "seeded") throw new ConflictError("INVALID_STATE");
      t.summary.status = "live";
      for (const m of t.matches) {
        if (m.roundNo === 1 && m.status === "pending" && m.a && m.b) {
          m.status = "ready";
        }
      }
    },

    async openMatch(id): Promise<void> {
      await tick();
      for (const t of tournaments) {
        const m = t.matches.find((x) => x.id === id);
        if (m) {
          if (m.status !== "ready") throw new ConflictError("INVALID_STATE");
          m.status = "live";
          return;
        }
      }
      throw new NotFoundError("NOT_FOUND");
    },

    async finalizeMatch(id, scoreA, scoreB): Promise<string> {
      await tick();
      for (const t of tournaments) {
        const m = t.matches.find((x) => x.id === id);
        if (!m) continue;
        if (t.summary.status !== "live") throw new ConflictError("INVALID_STATE");
        if (m.status === "finalized" || m.status === "bye") {
          throw new ConflictError("IMMUTABLE");
        }
        if (m.status !== "live" && m.status !== "processing") {
          throw new ConflictError("INVALID_STATE");
        }
        if (!m.a || !m.b) throw new ConflictError("INVALID_STATE");
        const winner = decide(m.a, m.b, scoreA, scoreB);
        m.status = "finalized";
        m.scoreA = scoreA;
        m.scoreB = scoreB;
        m.winnerId = winner;
        const parent = t.matches.find(
          (x) =>
            x.roundNo === m.roundNo + 1 &&
            Math.ceil(m.slot / 2) === x.slot,
        );
        if (parent) {
          const side = m.slot % 2 === 1 ? "a" : "b";
          const occupant = side === "a" ? parent.a : parent.b;
          if (occupant && occupant !== winner) throw new ConflictError("DUPLICATE");
          if (!occupant) {
            if (side === "a") parent.a = winner;
            else parent.b = winner;
          }
        }
        return winner;
      }
      throw new NotFoundError("NOT_FOUND");
    },

    async advanceTournament(id): Promise<string> {
      await tick();
      const t = need(id);
      if (t.summary.status !== "live") return t.summary.status;
      const open = t.matches.some(
        (m) => m.status !== "finalized" && m.status !== "bye" && m.status !== "cancelled",
      );
      if (!open) {
        t.summary.status = "processing";
        return "processing";
      }
      for (const m of t.matches) {
        if (m.status === "pending" && m.a && m.b) m.status = "ready";
      }
      return "live";
    },

    async finalizeTournament(id): Promise<Record<string, unknown>> {
      await tick();
      const t = need(id);
      if (t.summary.status === "finalized") {
        return { tournament_id: id, already: true };
      }
      if (t.summary.status !== "processing") throw new ConflictError("INVALID_STATE");
      const open = t.matches.some(
        (m) => m.status !== "finalized" && m.status !== "bye" && m.status !== "cancelled",
      );
      if (open) throw new ConflictError("INVALID_STATE");
      const final = t.matches
        .filter((m) => m.roundNo === t.rounds)
        .sort((a, b) => a.slot - b.slot)[0];
      if (!final?.winnerId) throw new ConflictError("INVALID_STATE");
      const champion = final.winnerId;
      const runner = final.a === champion ? final.b : final.a;
      const placements: TournamentPlacement[] = [
        { participantId: champion, displayName: champion, placement: 1 },
      ];
      if (runner) {
        placements.push({ participantId: runner, displayName: runner, placement: 2 });
      }
      const losers = new Set<string>();
      for (const m of t.matches) {
        if (m.status !== "finalized" || !m.a || !m.b || !m.winnerId) continue;
        losers.add(m.winnerId === m.a ? m.b : m.a);
      }
      losers.delete(champion);
      if (runner) losers.delete(runner);
      for (const pid of [...losers].sort()) {
        placements.push({ participantId: pid, displayName: pid, placement: 3 });
      }
      t.results = placements;
      t.finalizedCount += 1;
      t.summary.status = "finalized";
      return { tournament_id: id, champion, rewards: placements.length };
    },

    async syncSeason(): Promise<number> {
      await tick();
      return 0;
    },
  };
}
