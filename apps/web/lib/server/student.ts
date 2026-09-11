/**
 * Student composition layer (M6). Pure functions over StudentStore reads —
 * no Supabase, no session, no JSX. All numbers arrive server-computed; this
 * layer only selects, joins and shapes for display.
 */
import type {
  LeaderboardRow,
  MembershipState,
  ProfileState,
  StudentStore,
} from "./student-store";

export interface DashboardData {
  profile: ProfileState;
  membership: MembershipState | null;
  streak: { current: number; best: number };
  levelTitle: string;
  xpToNext: number | null;
  averages: { count: number; wpm: number; accuracy: number };
  latestBadge: { slug: string; name: string } | null;
  recentAttempts: Array<{
    id: string;
    gameSlug: string;
    status: string;
    score: number | null;
  }>;
  recommended: { slug: string; worldSlug: string } | null;
  rank: { rank: number; total: number } | null;
  isNew: boolean;
}

export async function getStudentDashboard(
  userId: string,
  store: StudentStore,
): Promise<DashboardData | null> {
  const [profile, membership, streak, averages, awards, attempts] =
    await Promise.all([
      store.getProfile(userId),
      store.getMembership(userId),
      store.getStreak(userId),
      store.aggregateResults(userId),
      store.listAwards(userId),
      store.listAttempts(userId, 5),
    ]);
  if (!profile) return null;

  const levelRow = await store.getLevel(profile.level);
  const nextRow = await store.getLevel(profile.level + 1);
  const xpToNext =
    nextRow && nextRow.requiredXp > profile.xpTotal
      ? nextRow.requiredXp - profile.xpTotal
      : null;

  let rank: DashboardData["rank"] = null;
  if (membership) {
    try {
      const rows = await store.leaderboard(membership.batchId, "all", 100);
      const idx = rows.findIndex((r) => r.userId === userId);
      if (idx >= 0) rank = { rank: idx + 1, total: rows.length };
    } catch {
      rank = null; // board failure must not break the dashboard
    }
  }

  const completed = await store.listCompletedGames(userId);
  const unlocks = await store.listUnlocks(userId);
  const games = await store.listGames();
  const recommended = recommendGame(games, unlocks, completed);

  return {
    profile,
    membership,
    streak: {
      current: streak?.current ?? 0,
      best: streak?.best ?? 0,
    },
    levelTitle: levelRow?.titleEn ?? "",
    xpToNext,
    averages: {
      count: averages.count,
      wpm: averages.avgWpm,
      accuracy: averages.avgAccuracy,
    },
    latestBadge: awards[0]
      ? { slug: awards[0].badgeSlug, name: awards[0].nameEn }
      : null,
    recentAttempts: attempts.map((a) => ({
      id: a.id,
      gameSlug: a.gameSlug,
      status: a.status,
      score: a.score,
    })),
    recommended,
    rank,
    isNew: averages.count === 0,
  };
}

/**
 * Recommendation heuristic (display order only — unlock truth stays in
 * game_unlocks, written by the progression function): earliest catalog game
 * that is unlocked but not yet completed; else earliest incomplete; else null.
 */
export function recommendGame(
  games: Array<{ slug: string; worldSlug: string }>,
  unlocked: string[],
  completed: string[],
): { slug: string; worldSlug: string } | null {
  const done = new Set(completed);
  const open = new Set(unlocked);
  for (const g of games) {
    if (open.has(g.slug) && !done.has(g.slug)) {
      return { slug: g.slug, worldSlug: g.worldSlug };
    }
  }
  for (const g of games) {
    if (!done.has(g.slug)) return { slug: g.slug, worldSlug: g.worldSlug };
  }
  return null;
}

export interface PublicProfile {
  userId: string;
  fullName: string;
  rollNumber: string;
  batchName: string;
  courseName: string;
  skillTrack: string;
  level: number;
  xpTotal: number;
  streak: { current: number; best: number };
  averages: { count: number; wpm: number; accuracy: number };
  badges: Array<{ slug: string; name: string; iconKey: string }>;
  achievements: Array<{ slug: string; name: string; value: number }>;
  records: Array<{ gameSlug: string; metric: string; value: number }>;
  gamesCompleted: number;
  worldsCompleted: number;
}

/** Own full profile (private fields stay in the server component). */
export async function getStudentProfile(
  userId: string,
  store: StudentStore,
): Promise<(PublicProfile & { email: string; coins: number }) | null> {
  const [profile, membership, streak, averages, awards, ach, records] =
    await Promise.all([
      store.getProfile(userId),
      store.getMembership(userId),
      store.getStreak(userId),
      store.aggregateResults(userId),
      store.listAwards(userId),
      store.listAchievementAwards(userId),
      store.listRecords(userId),
    ]);
  if (!profile) return null;
  const completed = await store.listCompletedGames(userId);
  return {
    userId: profile.userId,
    email: profile.email,
    coins: profile.coinBalance,
    fullName: profile.fullName,
    rollNumber: membership?.rollNumber ?? "",
    batchName: membership?.batchName ?? "",
    courseName: membership?.courseName ?? "",
    skillTrack: membership?.skillTrack ?? "",
    level: profile.level,
    xpTotal: profile.xpTotal,
    streak: { current: streak?.current ?? 0, best: streak?.best ?? 0 },
    averages: {
      count: averages.count,
      wpm: averages.avgWpm,
      accuracy: averages.avgAccuracy,
    },
    badges: awards.map((a) => ({
      slug: a.badgeSlug,
      name: a.nameEn,
      iconKey: a.iconKey,
    })),
    achievements: ach.map((a) => ({
      slug: a.slug,
      name: a.nameEn,
      value: a.value,
    })),
    records: records.map((r) => ({
      gameSlug: r.gameSlug,
      metric: r.metric,
      value: r.value,
    })),
    gamesCompleted: completed.length,
    worldsCompleted: 0, // filled by progress view (needs world map join)
  };
}

/** Batch-visible projection: email/coins never leave the server. */
export function toPublicProfile(
  full: PublicProfile & { email: string; coins: number },
): PublicProfile {
  const { email: _e, coins: _c, ...pub } = full;
  return pub;
}

export interface ProgressData {
  xpHistory: Array<{ amount: number; reason: string; createdAt: string }>;
  activeDays: string[];
  achievements: Array<{ slug: string; name: string; value: number }>;
  records: Array<{ gameSlug: string; metric: string; value: number }>;
  perWorld: Array<{
    worldSlug: string;
    total: number;
    completed: number;
    unlocked: number;
  }>;
}

export async function getProgressData(
  userId: string,
  store: StudentStore,
): Promise<ProgressData | null> {
  const profile = await store.getProfile(userId);
  if (!profile) return null;
  const [xpHistory, activeDays, ach, records, games, unlocks, completed] =
    await Promise.all([
      store.listXpHistory(userId, 30),
      store.listStreakEvents(userId, 90),
      store.listAchievementAwards(userId),
      store.listRecords(userId),
      store.listGames(),
      store.listUnlocks(userId),
      store.listCompletedGames(userId),
    ]);
  const done = new Set(completed);
  const open = new Set(unlocks);
  const byWorld = new Map<string, { total: number; completed: number; unlocked: number }>();
  for (const g of games) {
    const entry = byWorld.get(g.worldSlug) ?? {
      total: 0,
      completed: 0,
      unlocked: 0,
    };
    entry.total += 1;
    if (done.has(g.slug)) entry.completed += 1;
    if (open.has(g.slug)) entry.unlocked += 1;
    byWorld.set(g.worldSlug, entry);
  }
  return {
    xpHistory,
    activeDays,
    achievements: ach.map((a) => ({
      slug: a.slug,
      name: a.nameEn,
      value: a.value,
    })),
    records: records.map((r) => ({
      gameSlug: r.gameSlug,
      metric: r.metric,
      value: r.value,
    })),
    perWorld: [...byWorld.entries()].map(([worldSlug, v]) => ({
      worldSlug,
      ...v,
    })),
  };
}

export class BoardAccessError extends Error {
  constructor() {
    super("BOARD_FORBIDDEN");
  }
}

export async function getBatchLeaderboard(
  userId: string,
  store: StudentStore,
  opts: { batchId?: string | undefined; window?: string | undefined },
): Promise<{ batchId: string; batchName: string; window: string; rows: LeaderboardRow[] }> {
  const membership = await store.getMembership(userId);
  if (!membership) throw new BoardAccessError();
  const batchId = opts.batchId ?? membership.batchId;
  const window = opts.window ?? "all";
  let rows: LeaderboardRow[];
  try {
    rows = await store.leaderboard(batchId, window, 100);
  } catch {
    // The function itself enforces membership — never leak other batches.
    throw new BoardAccessError();
  }
  return { batchId, batchName: membership.batchName, window, rows };
}
