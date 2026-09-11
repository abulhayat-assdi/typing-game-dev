/**
 * Student read boundary (M6). All student UI reads flow through StudentStore —
 * never raw Supabase calls in components, never business-logic duplication.
 * Two implementations: Supabase (user-scoped client, RLS enforced) and memory
 * (offline tests). Every method returns JSON-serializable plain data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProfileState {
  userId: string;
  email: string;
  fullName: string;
  xpTotal: number;
  coinBalance: number;
  level: number;
  timezone: string;
}

export interface MembershipState {
  batchId: string;
  batchName: string;
  courseName: string;
  rollNumber: string;
  skillTrack: string;
}

export interface StreakState {
  current: number;
  best: number;
  activeDays: number;
}

export interface LevelState {
  level: number;
  requiredXp: number;
  titleEn: string;
}

export interface WorldState {
  slug: string;
  order: number;
  nameEn: string;
  nameBn: string;
  descriptionEn: string;
  descriptionBn: string;
}

export interface GameListItem {
  slug: string;
  worldSlug: string;
  category: string;
  mechanic: string;
  mode: string;
  difficulty: string;
  timingKind: string;
  timingLimitSeconds: number | null;
}

export interface BadgeState {
  slug: string;
  nameEn: string;
  iconKey: string;
  category: string;
}

export interface AwardState {
  badgeSlug: string;
  nameEn: string;
  iconKey: string;
  awardedAt: string;
}

export interface AchievementState {
  slug: string;
  nameEn: string;
  threshold: number;
}

export interface AchievementAwardState {
  slug: string;
  nameEn: string;
  value: number;
  awardedAt: string;
}

export interface RecordState {
  gameSlug: string;
  metric: string;
  value: number;
  attemptId: string;
}

export interface AttemptSummary {
  id: string;
  gameSlug: string;
  status: string;
  score: number | null;
  accuracy: number | null;
  createdAt: string;
}

export interface XpEntry {
  amount: number;
  reason: string;
  createdAt: string;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  fullName: string;
  rollNumber: string;
  level: number;
  xpTotal: number;
  xpWindow: number;
  attempts: number;
  avgWpm: number;
  avgAccuracy: number;
  streak: number;
  badges: string[];
}

export interface StudentStore {
  getProfile(userId: string): Promise<ProfileState | null>;
  getMembership(userId: string): Promise<MembershipState | null>;
  getStreak(userId: string): Promise<StreakState | null>;
  getLevel(level: number): Promise<LevelState | null>;
  listWorlds(): Promise<WorldState[]>;
  listGames(): Promise<GameListItem[]>;
  getGame(slug: string): Promise<GameListItem | null>;
  listBadges(): Promise<BadgeState[]>;
  listAchievements(): Promise<AchievementState[]>;
  listAwards(userId: string): Promise<AwardState[]>;
  listAchievementAwards(userId: string): Promise<AchievementAwardState[]>;
  listRecords(userId: string): Promise<RecordState[]>;
  listAttempts(userId: string, limit: number): Promise<AttemptSummary[]>;
  listUnlocks(userId: string): Promise<string[]>;
  listCompletedGames(userId: string): Promise<string[]>;
  aggregateResults(userId: string): Promise<{
    count: number;
    avgWpm: number;
    avgAccuracy: number;
    bestWpm: number;
    bestAccuracy: number;
  }>;
  listXpHistory(userId: string, limit: number): Promise<XpEntry[]>;
  listStreakEvents(userId: string, limit: number): Promise<string[]>;
  leaderboard(
    batchId: string,
    window: string,
    limit: number,
  ): Promise<LeaderboardRow[]>;
  getPersonalBests(gameSlug: string, userId: string): Promise<RecordState[]>;
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

/** In-memory store for offline tests (fixtures only, no logic of its own). */
export interface MemoryStudentFixtures {
  profiles?: Record<string, ProfileState>;
  memberships?: Record<string, MembershipState>;
  streaks?: Record<string, StreakState>;
  levels?: Record<number, LevelState>;
  worlds?: WorldState[];
  games?: Array<
    GameListItem & { titleEn: string; titleBn: string; descriptionEn: string }
  >;
  badges?: BadgeState[];
  achievements?: AchievementState[];
  awards?: Record<string, AwardState[]>;
  achievementAwards?: Record<string, AchievementAwardState[]>;
  records?: Array<RecordState & { userId: string }>;
  attempts?: Array<AttemptSummary & { userId: string }>;
  unlocks?: Record<string, string[]>;
  completed?: Record<string, string[]>;
  aggregates?: Record<
    string,
    { count: number; avgWpm: number; avgAccuracy: number; bestWpm: number; bestAccuracy: number }
  >;
  xpHistory?: Record<string, XpEntry[]>;
  streakEvents?: Record<string, string[]>;
  boards?: Record<string, LeaderboardRow[]>;
  boardError?: string | null;
}

export function createMemoryStudentStore(
  fx: MemoryStudentFixtures = {},
): StudentStore {
  const pick = <T>(m: Record<string, T> | undefined, k: string): T | null =>
    m?.[k] ?? null;
  return {
    getProfile: (userId) => Promise.resolve(pick(fx.profiles, userId)),
    getMembership: (userId) => Promise.resolve(pick(fx.memberships, userId)),
    getStreak: (userId) => Promise.resolve(pick(fx.streaks, userId)),
    getLevel: (level) =>
      Promise.resolve(fx.levels?.[level] ?? null),
    listWorlds: () => Promise.resolve(fx.worlds ?? []),
    listGames: () =>
      Promise.resolve(
        (fx.games ?? []).map(
          ({ titleEn: _t, titleBn: _b, descriptionEn: _d, ...rest }) => rest,
        ),
      ),
    getGame: (slug) =>
      Promise.resolve(
        (fx.games ?? [])
          .filter((g) => g.slug === slug)
          .map(
            ({ titleEn: _t, titleBn: _b, descriptionEn: _d, ...rest }) => rest,
          )[0] ?? null,
      ),
    listBadges: () => Promise.resolve(fx.badges ?? []),
    listAchievements: () => Promise.resolve(fx.achievements ?? []),
    listAwards: (userId) => Promise.resolve(fx.awards?.[userId] ?? []),
    listAchievementAwards: (userId) =>
      Promise.resolve(fx.achievementAwards?.[userId] ?? []),
    listRecords: (userId) =>
      Promise.resolve(
        (fx.records ?? [])
          .filter((r) => r.userId === userId)
          .map(({ userId: _u, ...rest }) => rest),
      ),
    listAttempts: (userId, limit) =>
      Promise.resolve(
        (fx.attempts ?? []).filter((a) => a.userId === userId).slice(0, limit),
      ),
    listUnlocks: (userId) => Promise.resolve(fx.unlocks?.[userId] ?? []),
    listCompletedGames: (userId) => Promise.resolve(fx.completed?.[userId] ?? []),
    aggregateResults: (userId) =>
      Promise.resolve(
        fx.aggregates?.[userId] ?? {
          count: 0,
          avgWpm: 0,
          avgAccuracy: 0,
          bestWpm: 0,
          bestAccuracy: 0,
        },
      ),
    listXpHistory: (userId, limit) =>
      Promise.resolve((fx.xpHistory?.[userId] ?? []).slice(0, limit)),
    listStreakEvents: (userId, limit) =>
      Promise.resolve((fx.streakEvents?.[userId] ?? []).slice(0, limit)),
    leaderboard: (batchId, window, limit) => {
      if (fx.boardError) return Promise.reject(new Error(fx.boardError));
      const key = `${batchId}:${window}`;
      return Promise.resolve((fx.boards?.[key] ?? []).slice(0, limit));
    },
    getPersonalBests: (gameSlug, userId) =>
      Promise.resolve(
        (fx.records ?? [])
          .filter((r) => r.gameSlug === gameSlug && r.userId === userId)
          .map(({ userId: _u, ...rest }) => rest),
      ),
  };
}
export function createSupabaseStudentStore(
  client: SupabaseClient,
): StudentStore {
  return {
    async getProfile(userId) {
      const res = await client
        .from("profiles")
        .select("id, email, full_name, xp_total, coin_balance, current_level, timezone")
        .eq("id", userId)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      if (typeof d.id !== "string") return null;
      return {
        userId: d.id,
        email: str(d.email),
        fullName: str(d.full_name),
        xpTotal: num(d.xp_total),
        coinBalance: num(d.coin_balance),
        level: num(d.current_level, 1),
        timezone: str(d.timezone, "Asia/Dhaka"),
      };
    },

    async getMembership(userId) {
      const res = await client
        .from("batch_members")
        .select(
          "batch_id, roll_number, skill_track, batches!inner(name, courses!inner(title))",
        )
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      const batch = Array.isArray(d.batches)
        ? d.batches.find(isRecord)
        : isRecord(d.batches)
          ? d.batches
          : null;
      const course = batch
        ? Array.isArray(batch.courses)
          ? batch.courses.find(isRecord)
          : isRecord(batch.courses)
            ? batch.courses
            : null
        : null;
      if (typeof d.batch_id !== "string" || !batch) return null;
      return {
        batchId: d.batch_id,
        batchName: str(batch.name),
        courseName: course ? str(course.title) : "",
        rollNumber: str(d.roll_number),
        skillTrack: str(d.skill_track),
      };
    },

    async getStreak(userId) {
      const res = await client
        .from("streaks")
        .select("current_count, best_count, active_days")
        .eq("user_id", userId)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      return {
        current: num(res.data.current_count),
        best: num(res.data.best_count),
        activeDays: num(res.data.active_days),
      };
    },

    async getLevel(level) {
      const res = await client
        .from("levels")
        .select("level, required_xp, title_en")
        .eq("level", level)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      return {
        level: num(res.data.level, level),
        requiredXp: num(res.data.required_xp),
        titleEn: str(res.data.title_en),
      };
    },

    async listWorlds() {
      const res = await client
        .from("worlds")
        .select("id, sort_order, name_en, name_bn, description_en, description_bn")
        .order("sort_order");
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        return [
          {
            slug: d.id,
            order: num(d.sort_order),
            nameEn: str(d.name_en),
            nameBn: str(d.name_bn),
            descriptionEn: str(d.description_en),
            descriptionBn: str(d.description_bn),
          },
        ];
      });
    },

    async listGames() {
      // Titles/descriptions live in @tap/content (TS catalog); the DB holds
      // operational state. Composition merges both (see lib/server/games.ts).
      const res = await client
        .from("games")
        .select(
          "slug, world_id, category, mechanic, mode, difficulty, timing",
        )
        .eq("is_active", true);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.slug !== "string" || typeof d.world_id !== "string") {
          return [];
        }
        const timing = isRecord(d.timing) ? d.timing : {};
        return [
          {
            slug: d.slug,
            worldSlug: d.world_id,
            category: str(d.category),
            mechanic: str(d.mechanic),
            mode: str(d.mode),
            difficulty: str(d.difficulty),
            timingKind: typeof timing.kind === "string" ? timing.kind : "untimed",
            timingLimitSeconds:
              typeof timing.limitSeconds === "number" ? timing.limitSeconds : null,
          },
        ];
      });
    },

    async getGame(slug) {
      const all = await this.listGames();
      return all.find((g) => g.slug === slug) ?? null;
    },

    async listBadges() {
      const res = await client
        .from("badges")
        .select("id, name_en, icon_key, category")
        .eq("is_active", true);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        return [
          {
            slug: d.id,
            nameEn: str(d.name_en),
            iconKey: str(d.icon_key),
            category: str(d.category),
          },
        ];
      });
    },

    async listAchievements() {
      const res = await client
        .from("achievements")
        .select("id, name_en, threshold")
        .eq("is_active", true);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        return [
          { slug: d.id, nameEn: str(d.name_en), threshold: num(d.threshold) },
        ];
      });
    },

    async listAwards(userId) {
      const res = await client
        .from("badge_awards")
        .select("awarded_at, badges!inner(id, name_en, icon_key)")
        .eq("user_id", userId)
        .order("awarded_at", { ascending: false })
        .limit(50);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const b = Array.isArray(d.badges)
          ? d.badges.find(isRecord)
          : isRecord(d.badges)
            ? d.badges
            : null;
        if (!b || typeof b.id !== "string") return [];
        return [
          {
            badgeSlug: b.id,
            nameEn: str(b.name_en),
            iconKey: str(b.icon_key),
            awardedAt: str(d.awarded_at),
          },
        ];
      });
    },

    async listAchievementAwards(userId) {
      const res = await client
        .from("achievement_awards")
        .select("value, awarded_at, achievements!inner(id, name_en)")
        .eq("user_id", userId)
        .order("awarded_at", { ascending: false })
        .limit(50);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const a = Array.isArray(d.achievements)
          ? d.achievements.find(isRecord)
          : isRecord(d.achievements)
            ? d.achievements
            : null;
        if (!a || typeof a.id !== "string") return [];
        return [
          {
            slug: a.id,
            nameEn: str(a.name_en),
            value: num(d.value),
            awardedAt: str(d.awarded_at),
          },
        ];
      });
    },

    async listRecords(userId) {
      const res = await client
        .from("personal_records")
        .select("metric, value, attempt_id, games!inner(slug)")
        .eq("user_id", userId);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const g = Array.isArray(d.games)
          ? d.games.find(isRecord)
          : isRecord(d.games)
            ? d.games
            : null;
        if (typeof d.metric !== "string" || !g || typeof g.slug !== "string") {
          return [];
        }
        return [
          {
            gameSlug: g.slug,
            metric: d.metric,
            value: num(d.value),
            attemptId: str(d.attempt_id),
          },
        ];
      });
    },

    async listAttempts(userId, limit) {
      const res = await client
        .from("game_attempts")
        .select(
          "id, status, created_at, games!inner(slug), attempt_results(score, accuracy)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const g = Array.isArray(d.games)
          ? d.games.find(isRecord)
          : isRecord(d.games)
            ? d.games
            : null;
        if (typeof d.id !== "string" || !g || typeof g.slug !== "string") {
          return [];
        }
        const r = Array.isArray(d.attempt_results)
          ? d.attempt_results.find(isRecord)
          : isRecord(d.attempt_results)
            ? d.attempt_results
            : null;
        return [
          {
            id: d.id,
            gameSlug: g.slug,
            status: str(d.status),
            score: r ? num(r.score) : null,
            accuracy: r ? num(r.accuracy) : null,
            createdAt: str(d.created_at),
          },
        ];
      });
    },

    async listUnlocks(userId) {
      const res = await client
        .from("game_unlocks")
        .select("game_slug")
        .eq("user_id", userId)
        .eq("unlocked", true);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const v: unknown = d.game_slug;
        return typeof v === "string" ? [v] : [];
      });
    },

    async listCompletedGames(userId) {
      const res = await client
        .from("game_attempts")
        .select("games!inner(slug)")
        .eq("user_id", userId)
        .eq("status", "validated");
      if (res.error || !Array.isArray(res.data)) return [];
      const slugs = new Set<string>();
      for (const d of res.data.filter(isRecord)) {
        const g = Array.isArray(d.games)
          ? d.games.find(isRecord)
          : isRecord(d.games)
            ? d.games
            : null;
        if (g && typeof g.slug === "string") slugs.add(g.slug);
      }
      return [...slugs];
    },

    async aggregateResults(userId) {
      const res = await client
        .from("game_attempts")
        .select("attempt_results!inner(effective_wpm, accuracy)")
        .eq("user_id", userId)
        .eq("status", "validated");
      if (res.error || !Array.isArray(res.data)) {
        return { count: 0, avgWpm: 0, avgAccuracy: 0, bestWpm: 0, bestAccuracy: 0 };
      }
      const rows = res.data.filter(isRecord).flatMap((d) => {
        const r = Array.isArray(d.attempt_results)
          ? d.attempt_results.find(isRecord)
          : isRecord(d.attempt_results)
            ? d.attempt_results
            : null;
        if (!r) return [];
        return [{ wpm: num(r.effective_wpm), acc: num(r.accuracy) }];
      });
      if (rows.length === 0) {
        return { count: 0, avgWpm: 0, avgAccuracy: 0, bestWpm: 0, bestAccuracy: 0 };
      }
      const sum = rows.reduce(
        (a, r) => ({ wpm: a.wpm + r.wpm, acc: a.acc + r.acc }),
        { wpm: 0, acc: 0 },
      );
      return {
        count: rows.length,
        avgWpm: sum.wpm / rows.length,
        avgAccuracy: sum.acc / rows.length,
        bestWpm: Math.max(...rows.map((r) => r.wpm)),
        bestAccuracy: Math.max(...rows.map((r) => r.acc)),
      };
    },

    async listXpHistory(userId, limit) {
      const res = await client
        .from("xp_ledger")
        .select("amount, reason, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).map((d) => ({
        amount: num(d.amount),
        reason: str(d.reason),
        createdAt: str(d.created_at),
      }));
    },

    async listStreakEvents(userId, limit) {
      const res = await client
        .from("streak_events")
        .select("activity_date")
        .eq("user_id", userId)
        .order("activity_date", { ascending: false })
        .limit(limit);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const v: unknown = d.activity_date;
        return typeof v === "string" ? [v] : [];
      });
    },

    async leaderboard(batchId, window, limit) {
      const res = await client.rpc("fn_batch_leaderboard", {
        p_batch_id: batchId,
        p_window: window,
        p_limit: limit,
      });
      if (res.error || !Array.isArray(res.data)) {
        const message =
          isRecord(res.error) && typeof res.error.message === "string"
            ? res.error.message
            : "LEADERBOARD_FAILED";
        throw new Error(message);
      }
      return res.data.filter(isRecord).flatMap((d) => {
        if (
          typeof d.user_id !== "string" ||
          typeof d.full_name !== "string" ||
          typeof d.roll_number !== "string"
        ) {
          return [];
        }
        return [
          {
            rank: num(d.rank),
            userId: d.user_id,
            fullName: d.full_name,
            rollNumber: d.roll_number,
            level: num(d.level, 1),
            xpTotal: num(d.xp_total),
            xpWindow: num(d.xp_window),
            attempts: num(d.attempts),
            avgWpm: num(d.avg_wpm),
            avgAccuracy: num(d.avg_accuracy),
            streak: num(d.streak_current ?? d.streak),
            badges: Array.isArray(d.badges)
              ? d.badges.filter((b): b is string => typeof b === "string")
              : [],
          },
        ];
      });
    },

    async getPersonalBests(gameSlug, userId) {
      const all = await this.listRecords(userId);
      return all.filter((r) => r.gameSlug === gameSlug);
    },
  };
}
