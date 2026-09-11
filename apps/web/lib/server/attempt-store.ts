/**
 * Attempt persistence boundary (M4). Routes depend ONLY on AttemptStore —
 * never on SQL or the Supabase client directly — so attempt/security tests
 * run offline against the memory implementation while production uses
 * PostgREST RPCs (SECURITY DEFINER fns from 0007, RLS-enforced reads).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptStatus } from "@tap/game-engine";

export interface StoreGame {
  id: string;
  slug: string;
  versionId: string;
  version: number;
  scoringProfile: string;
  promptSetRef: string;
  promptUnits: number;
  expiresAfterSeconds: number;
  timingKind: string;
  timingLimitSeconds: number | null;
}

export interface StoreAttempt {
  id: string;
  userId: string;
  gameSlug: string;
  gameVersionId: string;
  /** Scoring profile captured at start (retired games stay submittable). */
  scoringProfile: string;
  expectedText: string;
  difficulty: string;
  status: AttemptStatus;
  expiresAt: string;
  submittedAt: string | null;
  finalizedAt: string | null;
}

export interface StoredResult {
  score: number;
  accuracy: number;
  effectiveWpm: number;
  isValid: boolean;
  rejectedReason: string | null;
}

export interface AttemptStore {
  getActiveGame(slug: string): Promise<StoreGame | null>;
  startAttempt(input: {
    game: StoreGame;
    userId: string;
    difficulty: string;
    seed: string;
    expectedText: string;
  }): Promise<StoreAttempt>;
  getAttempt(id: string): Promise<StoreAttempt | null>;
  getResult(attemptId: string): Promise<StoredResult | null>;
  submitAttempt(input: {
    attemptId: string;
    raw: Record<string, unknown>;
    score: number;
    accuracy: number;
    effectiveWpm: number;
    valid: boolean;
    reason: string | null;
  }): Promise<AttemptStatus>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asError(e: unknown): { message: string } | null {
  if (!isRecord(e)) return null;
  return typeof e.message === "string" ? { message: e.message } : null;
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseAttemptStore(
  client: SupabaseClient,
): AttemptStore {
  return {
    async getActiveGame(slug: string): Promise<StoreGame | null> {
      const res = await client
        .from("games")
        .select(
          "id, slug, scoring_profile_id, prompt_set_ref, prompt_units, current_version, timing, attempt_rules, game_versions!inner(id, version)",
        )
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      const versions = Array.isArray(d.game_versions)
        ? d.game_versions.filter(isRecord)
        : [];
      const current = versions.find((v) => v.version === d.current_version);
      if (
        typeof d.id !== "string" ||
        typeof d.slug !== "string" ||
        typeof d.scoring_profile_id !== "string" ||
        typeof d.prompt_set_ref !== "string" ||
        typeof d.prompt_units !== "number" ||
        typeof d.current_version !== "number" ||
        !isRecord(current) ||
        typeof current.id !== "string"
      ) {
        return null;
      }
      const timing = isRecord(d.timing) ? d.timing : {};
      const rules = isRecord(d.attempt_rules) ? d.attempt_rules : {};
      return {
        id: d.id,
        slug: d.slug,
        versionId: current.id,
        version: d.current_version,
        scoringProfile: d.scoring_profile_id,
        promptSetRef: d.prompt_set_ref,
        promptUnits: d.prompt_units,
        expiresAfterSeconds:
          typeof rules.expiresAfterSeconds === "number"
            ? rules.expiresAfterSeconds
            : 900,
        timingKind: typeof timing.kind === "string" ? timing.kind : "untimed",
        timingLimitSeconds:
          typeof timing.limitSeconds === "number" ? timing.limitSeconds : null,
      };
    },

    async startAttempt(input): Promise<StoreAttempt> {
      const res = await client.rpc("fn_start_attempt", {
        p_game_slug: input.game.slug,
        p_difficulty: input.difficulty,
        p_seed: input.seed,
        p_expected: input.expectedText,
        p_expires_after_seconds: input.game.expiresAfterSeconds,
      });
      if (res.error || typeof res.data !== "string") {
        throw new Error(asError(res.error)?.message ?? "START_FAILED");
      }
      const created = await this.getAttempt(res.data);
      if (!created) throw new Error("START_FAILED");
      return created;
    },

    async getAttempt(id: string): Promise<StoreAttempt | null> {
      const res = await client
        .from("game_attempts")
        .select(
          "id, user_id, expected_text, difficulty, status, expires_at, submitted_at, finalized_at, game_id, game_version_id, games!inner(slug, scoring_profile_id)",
        )
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      const game = Array.isArray(d.games)
        ? d.games.find(isRecord)
        : isRecord(d.games)
          ? d.games
          : null;
      if (
        typeof d.id !== "string" ||
        typeof d.user_id !== "string" ||
        typeof d.expected_text !== "string" ||
        typeof d.difficulty !== "string" ||
        typeof d.status !== "string" ||
        typeof d.expires_at !== "string" ||
        !game ||
        typeof game.slug !== "string" ||
        typeof game.scoring_profile_id !== "string" ||
        typeof d.game_version_id !== "string"
      ) {
        return null;
      }
      return {
        id: d.id,
        userId: d.user_id,
        gameSlug: game.slug,
        gameVersionId: d.game_version_id,
        scoringProfile: game.scoring_profile_id,
        expectedText: d.expected_text,
        difficulty: d.difficulty,
        status: d.status as AttemptStatus,
        expiresAt: d.expires_at,
        submittedAt:
          typeof d.submitted_at === "string" ? d.submitted_at : null,
        finalizedAt:
          typeof d.finalized_at === "string" ? d.finalized_at : null,
      };
    },

    async getResult(attemptId: string): Promise<StoredResult | null> {
      const res = await client
        .from("attempt_results")
        .select("score, accuracy, effective_wpm, is_valid, rejected_reason")
        .eq("attempt_id", attemptId)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      if (
        typeof d.score !== "number" ||
        typeof d.accuracy !== "number" ||
        typeof d.effective_wpm !== "number" ||
        typeof d.is_valid !== "boolean"
      ) {
        return null;
      }
      return {
        score: d.score,
        accuracy: d.accuracy,
        effectiveWpm: d.effective_wpm,
        isValid: d.is_valid,
        rejectedReason:
          typeof d.rejected_reason === "string" ? d.rejected_reason : null,
      };
    },

    async submitAttempt(input): Promise<AttemptStatus> {
      const res = await client.rpc("fn_submit_attempt", {
        p_attempt_id: input.attemptId,
        p_raw: input.raw,
        p_score: input.score,
        p_accuracy: input.accuracy,
        p_wpm: input.effectiveWpm,
        p_valid: input.valid,
        p_reason: input.reason,
      });
      if (res.error || typeof res.data !== "string") {
        throw new Error(asError(res.error)?.message ?? "SUBMIT_FAILED");
      }
      return res.data as AttemptStatus;
    },
  };
}

/**
 * In-memory store for offline route tests. Mirrors fn_start/fn_submit
 * semantics (active-game gate, ownership, terminal states, expiry) without
 * SQL — divergences from the functions are test bugs, report them.
 */
export interface MemoryGameSeed {
  slug: string;
  active?: boolean;
  scoringProfile?: string;
  promptSetRef?: string;
  promptUnits?: number;
  expiresAfterSeconds?: number;
}

export function createMemoryAttemptStore(
  games: MemoryGameSeed[] = [
    { slug: "test-game" },
    { slug: "retired-game", active: false },
  ],
): AttemptStore & { __live: Map<string, StoreAttempt & { result?: StoredResult }> } {
  const live = new Map<string, StoreAttempt & { result?: StoredResult }>();
  let n = 0;

  const findGame = (slug: string): StoreGame | null => {
    const g = games.find((x) => x.slug === slug && x.active !== false);
    if (!g) return null;
    return {
      id: `game-${g.slug}`,
      slug: g.slug,
      versionId: `ver-${g.slug}-1`,
      version: 1,
      scoringProfile: g.scoringProfile ?? "standard",
      promptSetRef: g.promptSetRef ?? "test",
      promptUnits: g.promptUnits ?? 10,
      expiresAfterSeconds: g.expiresAfterSeconds ?? 900,
      timingKind: "untimed",
      timingLimitSeconds: null,
    };
  };

  return {
    __live: live,

    getActiveGame: (slug: string): Promise<StoreGame | null> =>
      Promise.resolve(findGame(slug)),

    startAttempt: (input): Promise<StoreAttempt> => {
      n += 1;
      const attempt: StoreAttempt = {
        id: "attempt-" + String(n),
        userId: input.userId,
        gameSlug: input.game.slug,
        gameVersionId: input.game.versionId,
        scoringProfile: input.game.scoringProfile,
        expectedText: input.expectedText,
        difficulty: input.difficulty,
        status: "started",
        expiresAt: new Date(
          Date.now() + input.game.expiresAfterSeconds * 1000,
        ).toISOString(),
        submittedAt: null,
        finalizedAt: null,
      };
      live.set(attempt.id, attempt);
      return Promise.resolve(attempt);
    },

    getAttempt: (id: string): Promise<StoreAttempt | null> =>
      Promise.resolve(live.get(id) ?? null),

    getResult: (id: string): Promise<StoredResult | null> =>
      Promise.resolve(live.get(id)?.result ?? null),

    submitAttempt: (input): Promise<AttemptStatus> => {
      const a = live.get(input.attemptId);
      if (!a) throw new Error("ATTEMPT_NOT_FOUND");
      if (a.status === "validated" || a.status === "rejected") {
        throw new Error("ALREADY_FINALIZED");
      }
      if (Date.now() > Date.parse(a.expiresAt)) throw new Error("ATTEMPT_EXPIRED");
      const status: AttemptStatus = input.valid ? "validated" : "rejected";
      const now = new Date().toISOString();
      const done: StoreAttempt & { result?: StoredResult } = {
        ...a,
        status,
        submittedAt: now,
        finalizedAt: now,
        result: {
          score: input.score,
          accuracy: input.accuracy,
          effectiveWpm: input.effectiveWpm,
          isValid: input.valid,
          rejectedReason: input.reason,
        },
      };
      live.set(a.id, done);
      return Promise.resolve(status);
    },
  };
}
