/**
 * Adaptive persistence boundary (M15). Routes depend ONLY on
 * AdaptiveStore — never on SQL directly — so adaptive/API tests run
 * offline against the memory implementation while production uses
 * PostgREST RPCs (SECURITY DEFINER fns from 0032, RLS reads).
 *
 * Enforcement lives in the database. The store never scores typing,
 * never mints XP/coins, never creates missions: it records validated
 * evidence and serves cached summaries/recommendations.
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

export interface AdaptiveKeyEvidence {
  key: string;
  exposures: number;
  errors: number;
}

export interface AdaptivePairEvidence {
  expected: string;
  actual: string;
  count: number;
}

export interface AdaptiveDimension {
  dimension: string;
  value: number;
  evidence: number;
}

export interface AdaptiveTrend {
  metric: string;
  recent: number | null;
  baseline: number | null;
  trend: string;
  evidence: number;
}

export interface AdaptiveWeakness {
  type: string;
  target: string;
  promptKind: string;
  score: number;
  confidence: number;
  trend: string;
}

export interface AdaptiveRecommendation {
  id: string;
  rank: number;
  gameSlug: string;
  difficulty: string;
  missionId: string | null;
  reason: string;
  message: string;
  benefit: string;
  confidence: number;
  targets: string[];
  drillWords: string[];
}

export interface AdaptiveDifficulty {
  gameSlug: string;
  band: string;
  promptMinLen: number;
  promptMaxLen: number;
  targetWpm: number;
  targetAccuracy: number;
}

export interface AdaptiveSummary {
  band: string;
  evidence: number;
  dimensions: AdaptiveDimension[];
  trends: AdaptiveTrend[];
  weaknesses: AdaptiveWeakness[];
  recommendations: AdaptiveRecommendation[];
  difficulty: AdaptiveDifficulty[];
}

export interface AdaptiveStore {
  recordAttempt(input: {
    attemptId: string;
    keys: AdaptiveKeyEvidence[];
    pairs: AdaptivePairEvidence[];
  }): Promise<boolean>;
  refreshProfile(): Promise<Record<string, unknown>>;
  getSummary(): Promise<AdaptiveSummary | null>;
  sendFeedback(recommendationId: string, event: string): Promise<void>;
  batchSummary(batchId: string): Promise<Record<string, unknown>>;
  globalSummary(): Promise<Record<string, unknown>>;
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

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function mapStoreError(e: unknown): Error {
  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|NOT_AUTHENTICATED|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND/i.test(message)) return new NotFoundError(message);
  if (/MALFORMED|INVALID_STATE|INVALID/i.test(message)) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

function toSummary(v: unknown): AdaptiveSummary | null {
  if (!isRecord(v)) return null;
  const profile = isRecord(v.profile) ? v.profile : null;
  const recs = Array.isArray(v.recommendations) ? v.recommendations : [];
  const weak = Array.isArray(v.weaknesses) ? v.weaknesses : [];
  const dims = Array.isArray(v.dimensions) ? v.dimensions : [];
  const trends = Array.isArray(v.trends) ? v.trends : [];
  const diff = Array.isArray(v.difficulty) ? v.difficulty : [];
  return {
    band: str(profile?.practice_band, "beginner"),
    evidence: num(profile?.evidence_count),
    dimensions: dims.filter(isRecord).map((d) => ({
      dimension: str(d.dimension),
      value: num(d.value),
      evidence: num(d.evidence),
    })),
    trends: trends.filter(isRecord).map((t) => ({
      metric: str(t.metric),
      recent: typeof t.recent === "number" ? t.recent : null,
      baseline: typeof t.baseline === "number" ? t.baseline : null,
      trend: str(t.trend, "insufficient"),
      evidence: num(t.evidence),
    })),
    weaknesses: weak.filter(isRecord).map((w) => ({
      type: str(w.type),
      target: str(w.target),
      promptKind: str(w.prompt_kind, "words"),
      score: num(w.score),
      confidence: num(w.confidence),
      trend: str(w.trend, "insufficient"),
    })),
    recommendations: recs.filter(isRecord).map((r) => ({
      id: str(r.id),
      rank: num(r.rank),
      gameSlug: str(r.game_slug),
      difficulty: str(r.difficulty, "beginner"),
      missionId: typeof r.mission_id === "string" ? r.mission_id : null,
      reason: str(r.reason),
      message: str(r.message),
      benefit: str(r.benefit),
      confidence: num(r.confidence),
      targets: strArray(r.targets),
      drillWords: strArray(r.drill_words),
    })),
    difficulty: diff.filter(isRecord).map((d) => ({
      gameSlug: str(d.game_slug),
      band: str(d.band, "beginner"),
      promptMinLen: num(d.prompt_min_len, 5),
      promptMaxLen: num(d.prompt_max_len, 20),
      targetWpm: num(d.target_wpm, 15),
      targetAccuracy: num(d.target_accuracy, 85),
    })),
  };
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseAdaptiveStore(
  client: SupabaseClient,
): AdaptiveStore {
  async function call(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown }> {
    const res = await client.rpc(fn, args);
    if (res.error) throw mapStoreError(res.error);
    return { data: res.data };
  }

  return {
    async recordAttempt(input): Promise<boolean> {
      const { data } = await call("fn_record_adaptive_attempt", {
        p_attempt: input.attemptId,
        p_keys: input.keys,
        p_pairs: input.pairs,
      });
      return data === true;
    },

    async refreshProfile(): Promise<Record<string, unknown>> {
      const { data } = await call("fn_refresh_adaptive_profile", {});
      if (!isRecord(data)) throw new ConflictError("REFRESH_FAILED");
      return data;
    },

    async getSummary(): Promise<AdaptiveSummary | null> {
      const { data } = await call("fn_get_adaptive_summary", {});
      return toSummary(data);
    },

    async sendFeedback(recommendationId, event): Promise<void> {
      await call("fn_adaptive_feedback", {
        p_recommendation: recommendationId,
        p_event: event,
      });
    },

    async batchSummary(batchId): Promise<Record<string, unknown>> {
      const { data } = await call("fn_adaptive_batch_summary", {
        p_batch: batchId,
      });
      if (!isRecord(data)) throw new ConflictError("SUMMARY_FAILED");
      return data;
    },

    async globalSummary(): Promise<Record<string, unknown>> {
      const { data } = await call("fn_adaptive_global_summary", {});
      if (!isRecord(data)) throw new ConflictError("SUMMARY_FAILED");
      return data;
    },
  };
}

interface MemorySample {
  accuracy: number;
  wpm: number;
  at: number;
}

interface MemoryRec {
  id: string;
  gameSlug: string;
  reason: string;
  message: string;
  status: string;
  targets: string[];
}

/** Offline store for unit/API tests (simplified but behavior-plausible). */
export function createMemoryAdaptiveStore(): AdaptiveStore & {
  __samples: MemorySample[];
  __recs: MemoryRec[];
} {
  const samples: MemorySample[] = [];
  const recs: MemoryRec[] = [];
  const events: { id: string; event: string }[] = [];
  const keys = new Map<string, { exposures: number; errors: number }>();
  let clock = 0;
  let recCounter = 0;
  const nextRecId = (): string => {
    recCounter += 1;
    return `aaaaaaaa-0000-4000-8000-${String(recCounter).padStart(12, "0")}`;
  };
  const tick = (): Promise<void> => Promise.resolve();

  function refresh(): void {
    for (const r of recs) {
      if (r.status === "active") r.status = "superseded";
    }
    if (samples.length === 0) {
      recs.push({
        id: nextRecId(),
        gameSlug: "home-row",
        reason: "LOW_ACCURACY",
        message: "A gentle warm-up to begin.",
        status: "active",
        targets: [],
      });
      return;
    }
    const weak = [...keys.entries()]
      .filter(([, s]) => s.exposures >= 3 && s.errors > 0)
      .sort(
        (a, b) =>
          b[1].errors / b[1].exposures - a[1].errors / a[1].exposures,
      )[0];
    const avg =
      samples.reduce((s, x) => s + x.accuracy, 0) / samples.length;
    if (weak) {
      recs.push({
        id: nextRecId(),
        gameSlug: "word-builder",
        reason: "WEAK_KEY",
        message: `${weak[0]} needs a little more practice.`,
        status: "active",
        targets: [weak[0]],
      });
    } else if (avg < 93) {
      recs.push({
        id: nextRecId(),
        gameSlug: "word-builder",
        reason: "LOW_ACCURACY",
        message: "Steady accuracy practice will lock in your progress.",
        status: "active",
        targets: [],
      });
    } else {
      recs.push({
        id: nextRecId(),
        gameSlug: "speed-race",
        reason: "PERSONAL_BEST_OPPORTUNITY",
        message: "You're close to a personal best — go for it.",
        status: "active",
        targets: [],
      });
    }
  }

  return {
    __samples: samples,
    __recs: recs,

    async recordAttempt(input): Promise<boolean> {
      await tick();
      clock += 1;
      for (const k of input.keys) {
        const cur = keys.get(k.key) ?? { exposures: 0, errors: 0 };
        cur.exposures += k.exposures;
        cur.errors += k.errors;
        keys.set(k.key, cur);
      }
      const acc =
        input.keys.reduce((s, k) => s + (k.exposures - k.errors), 0) /
        Math.max(
          input.keys.reduce((s, k) => s + k.exposures, 0),
          1,
        );
      samples.push({ accuracy: acc * 100, wpm: 20, at: clock });
      return true;
    },

    async refreshProfile(): Promise<Record<string, unknown>> {
      await tick();
      refresh();
      return { recommendations: recs.filter((r) => r.status === "active").length };
    },

    async getSummary(): Promise<AdaptiveSummary> {
      await tick();
      const avg =
        samples.length > 0
          ? samples.reduce((s, x) => s + x.accuracy, 0) / samples.length
          : 0;
      return {
        band: "beginner",
        evidence: samples.length,
        dimensions: [
          { dimension: "accuracy", value: avg, evidence: samples.length },
        ],
        trends: [
          {
            metric: "accuracy",
            recent: samples.length > 0 ? avg : null,
            baseline: null,
            trend: samples.length >= 5 ? "stable" : "insufficient",
            evidence: samples.length,
          },
        ],
        weaknesses: [...keys.entries()]
          .filter(([, s]) => s.errors > 0)
          .map(([key, s]) => ({
            type: "key",
            target: key,
            promptKind: "words",
            score: s.errors / Math.max(s.exposures, 1),
            confidence: Math.min(1, s.exposures / 50),
            trend: "insufficient",
          })),
        recommendations: recs
          .filter((r) => r.status === "active")
          .map((r, i) => ({
            id: r.id,
            rank: i + 1,
            gameSlug: r.gameSlug,
            difficulty: "beginner",
            missionId: null,
            reason: r.reason,
            message: r.message,
            benefit: "Targeted play, about 5 minutes.",
            confidence: 0.5,
            targets: r.targets,
            drillWords: [],
          })),
        difficulty: [],
      };
    },

    async sendFeedback(recommendationId, event): Promise<void> {
      await tick();
      if (!["shown", "started", "completed", "abandoned", "skipped"].includes(event)) {
        throw new ConflictError("MALFORMED");
      }
      const r = recs.find((x) => x.id === recommendationId);
      if (!r) throw new NotFoundError("NOT_FOUND");
      events.push({ id: recommendationId, event });
      if (event === "started" && r.status === "active") r.status = "accepted";
      if (event === "completed") r.status = "completed";
      if (event === "skipped" && r.status === "active") r.status = "dismissed";
    },

    async batchSummary(): Promise<Record<string, unknown>> {
      await tick();
      return { attention: [], averages: {}, weak_mechanics: [], bands: [] };
    },

    async globalSummary(): Promise<Record<string, unknown>> {
      await tick();
      return { learners: 0, funnel: {} };
    },
  };
}
