/**
 * Client-safe game catalog helpers (M6). Pure filter/sort over enriched game
 * rows — importable from client components (no server/database imports).
 * Server composition lives in lib/server/games.ts.
 */
export interface EnrichedGame {
  slug: string;
  worldSlug: string;
  category: string;
  mechanic: string;
  mode: string;
  difficulty: string;
  timingKind: string;
  timingLimitSeconds: number | null;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  unlocked: boolean;
  lockedReasons: string[];
  completed: boolean;
  bestScore: number | null;
}

export type GameFilter = {
  query?: string;
  world?: string;
  difficulty?: string;
  mode?: string;
  status?: "all" | "unlocked" | "locked" | "completed";
};

export type GameSort = "recommended" | "easiest" | "best";

/** Pure filter for the library explorer (tested, UI-agnostic). */
export function filterGames(games: EnrichedGame[], f: GameFilter): EnrichedGame[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return games.filter((g) => {
    if (f.world && g.worldSlug !== f.world) return false;
    if (f.difficulty && g.difficulty !== f.difficulty) return false;
    if (f.mode && g.mode !== f.mode) return false;
    if (f.status === "unlocked" && (!g.unlocked || g.completed)) return false;
    if (f.status === "locked" && g.unlocked) return false;
    if (f.status === "completed" && !g.completed) return false;
    if (
      q &&
      !`${g.titleEn} ${g.slug} ${g.category}`.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

const DIFFICULTY_RANK: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

export function sortGames(
  games: EnrichedGame[],
  sort: GameSort,
  recommendedSlug: string | null,
): EnrichedGame[] {
  const list = [...games];
  switch (sort) {
    case "recommended":
      return list.sort((a, b) => {
        if (a.slug === recommendedSlug) return -1;
        if (b.slug === recommendedSlug) return 1;
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return (DIFFICULTY_RANK[a.difficulty] ?? 9) - (DIFFICULTY_RANK[b.difficulty] ?? 9);
      });
    case "easiest":
      return list.sort(
        (a, b) =>
          (DIFFICULTY_RANK[a.difficulty] ?? 9) - (DIFFICULTY_RANK[b.difficulty] ?? 9),
      );
    case "best":
      return list.sort((a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1));
  }
}
