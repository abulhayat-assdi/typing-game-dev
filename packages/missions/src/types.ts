/**
 * @tap/missions - mission domain (M9). Pure TypeScript, no UI/DB imports.
 * Server (0016-0018) reimplements the same semantics in SQL; this package
 * is the readable spec plus client-safe preview math (rotation, periods).
 */

export type MissionCategory =
  | "GAME_COMPLETION"
  | "ACCURACY_TARGET"
  | "WPM_TARGET"
  | "SCORE_TARGET"
  | "WORD_COUNT"
  | "CHARACTER_COUNT"
  | "PERFECT_RUN"
  | "COMBO_TARGET"
  | "WORLD_PROGRESS"
  | "MULTI_GAME"
  | "DAILY"
  | "WEEKLY"
  | "EVENT"
  | "COMPETITION"
  | "CLAN"
  | "SEASONAL";

export type ObjectiveKind =
  | "GAMES_COMPLETED"
  | "ACCURACY_REACHED"
  | "WPM_REACHED"
  | "SCORE_REACHED"
  | "CHARS_TYPED"
  | "WORDS_TYPED"
  | "PERFECT_RUN"
  | "DISTINCT_GAMES"
  | "PERSONAL_BEST"
  | "WORLD_GAMES";

export type MissionPeriod = "daily" | "weekly" | "event";

export type MissionInstanceStatus =
  | "locked"
  | "available"
  | "active"
  | "completed"
  | "expired"
  | "cancelled";

export interface ObjectiveTarget {
  count?: number;
  threshold?: number;
  mode?: "max" | "sum";
  games?: string[];
  worlds?: string[];
}

export interface MissionObjective {
  position: number;
  kind: ObjectiveKind;
  target: ObjectiveTarget;
}

export interface MissionDefinition {
  slug: string;
  title: string;
  description?: string;
  category: MissionCategory;
  difficulty?: string;
  skillBand?: string;
  period: MissionPeriod;
  objectives: MissionObjective[];
  gameSlugs?: string[];
  worldIds?: string[];
  rewardXp: number;
  rewardCoins: number;
  prerequisites?: {
    minLevel?: number;
    minXp?: number;
    games?: string[];
    missions?: string[];
    badges?: string[];
  };
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface ValidatedActivity {
  gameSlug: string;
  worldId: string;
  accuracy: number;
  effectiveWpm: number;
  score: number;
  correctCharacters: number;
  completedWords: number;
  incorrectCharacters: number;
  submittedAt: string;
  isPersonalBest?: boolean;
}

export interface ObjectiveProgress {
  position: number;
  kind: ObjectiveKind;
  current: number;
  target: number;
  completed: boolean;
  /** Machine reasons when incomplete (mirrors eligibility missing[]). */
  missing: string[];
}

export interface MissionProgress {
  objectives: ObjectiveProgress[];
  done: number;
  total: number;
  completed: boolean;
}

/** Extension point for future adaptive/personalized selection (M10+). */
export interface SelectionProfile {
  skillBand?: string;
  unlockedGameSlugs: string[];
  recentAccuracy: number | null;
  recentWpm: number | null;
  recentGameSlugs: string[];
}
