/**
 * Game catalog composition (M6). Merges DB operational state with the
 * @tap/content copy catalog; evaluates unlocks with the M5 TS evaluator over
 * server-assembled stats (same function family the SQL cache mirrors —
 * verdicts here explain, the game_unlocks rows authorize).
 */
import { GAMES, WORLDS } from "@tap/content";
import { evaluateUnlock, type UnlockStats } from "@tap/progression";
import type { StudentStore } from "./student-store";
import {
  filterGames,
  sortGames,
  type EnrichedGame,
  type GameFilter,
  type GameSort,
} from "../../lib/game-catalog";

export type { EnrichedGame, GameFilter, GameSort };
export { filterGames, sortGames };

export interface WorldMapEntry {
  slug: string;
  order: number;
  nameEn: string;
  nameBn: string;
  descriptionEn: string;
  descriptionBn: string;
  status: "complete" | "current" | "open" | "locked";
  total: number;
  completed: number;
  unlocked: number;
  nextGameSlug: string | null;
  games: EnrichedGame[];
}

async function playerStats(
  userId: string,
  store: StudentStore,
): Promise<UnlockStats> {
  const [profile, agg, completed, awards] = await Promise.all([
    store.getProfile(userId),
    store.aggregateResults(userId),
    store.listCompletedGames(userId),
    store.listAwards(userId),
  ]);
  return {
    level: profile?.level ?? 1,
    totalXp: profile?.xpTotal ?? 0,
    bestAccuracy: agg.bestAccuracy,
    bestWpm: agg.bestWpm,
    completedMissions: 0,
    completedGames: completed,
    badges: awards.map((a) => a.badgeSlug),
    worldsCompleted: [],
  };
}

export async function enrichGames(
  userId: string,
  store: StudentStore,
): Promise<EnrichedGame[]> {
  // Unlock verdicts are computed fresh via evaluateUnlock (same rule family
  // the SQL cache mirrors); the game_unlocks cache itself is only a shortcut.
  const [rows, completed, records] = await Promise.all([
    store.listGames(),
    store.listCompletedGames(userId),
    store.listRecords(userId),
  ]);
  const done = new Set(completed);
  const best = new Map<string, number>();
  for (const r of records) {
    if (r.metric === "best_score") best.set(r.gameSlug, r.value);
  }
  const stats = await playerStats(userId, store);
  const defs = new Map(GAMES.map((g) => [g.slug, g]));
  return rows.flatMap((row) => {
    const def = defs.get(row.slug);
    if (!def) return [];
    const verdict = evaluateUnlock(stats, def.unlockRule);
    return [
      {
        ...row,
        titleEn: def.title.en,
        titleBn: def.title.bn ?? "",
        descriptionEn: def.description.en,
        unlocked: verdict.unlocked,
        lockedReasons: verdict.missing,
        completed: done.has(row.slug),
        bestScore: best.get(row.slug) ?? null,
      },
    ];
  });
}

export async function getWorldMapData(
  userId: string,
  store: StudentStore,
  recommendedSlug: string | null,
): Promise<WorldMapEntry[]> {
  const games = await enrichGames(userId, store);
  const byWorld = new Map<string, EnrichedGame[]>();
  for (const g of games) {
    const list = byWorld.get(g.worldSlug) ?? [];
    list.push(g);
    byWorld.set(g.worldSlug, list);
  }
  return WORLDS.map((w) => {
    const list = byWorld.get(w.slug) ?? [];
    const completed = list.filter((g) => g.completed).length;
    const unlocked = list.filter((g) => g.unlocked).length;
    const next =
      list.find((g) => g.slug === recommendedSlug) ??
      list.find((g) => g.unlocked && !g.completed) ??
      null;
    const status: WorldMapEntry["status"] =
      list.length > 0 && completed === list.length
        ? "complete"
        : next
          ? "current"
          : unlocked > 0
            ? "open"
            : "locked";
    return {
      slug: w.slug,
      order: w.order,
      nameEn: w.name.en,
      nameBn: w.name.bn,
      descriptionEn: w.description.en,
      descriptionBn: w.description.bn,
      status,
      total: list.length,
      completed,
      unlocked,
      nextGameSlug: next?.slug ?? null,
      games: list,
    };
  });
}

export interface GameDetails extends EnrichedGame {
  promptUnits: number;
  scoringProfile: string;
  competitionEligible: boolean;
  version: number;
}

export async function getGameDetails(
  userId: string,
  slug: string,
  store: StudentStore,
): Promise<GameDetails | null> {
  const games = await enrichGames(userId, store);
  const found = games.find((g) => g.slug === slug);
  if (!found) return null;
  const defs = new Map(GAMES.map((g) => [g.slug, g]));
  const def = defs.get(slug);
  if (!def) return null;
  return {
    ...found,
    promptUnits: def.promptSource.units,
    scoringProfile: def.scoringProfile,
    competitionEligible: def.competitionEligible,
    version: def.version,
  };
}
