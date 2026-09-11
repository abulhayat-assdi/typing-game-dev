/**
 * Catalog integrity (M4). Every world/game/prompt-set/difficulty referenced
 * anywhere must exist exactly once and in a compatible shape — this is what
 * lets hundreds of future games land as data, never as code changes.
 */
import { getScoringProfile } from "@tap/scoring";
import {
  validateGameDefinition,
  type GameDefinition,
  type UnlockRule,
} from "@tap/game-engine";
import { getPromptSet } from "./prompts";
import { WORLDS } from "./worlds";
import { GAMES } from "./games";

export const CATALOG_VERSION = 1;

export interface CatalogInput {
  worlds?: typeof WORLDS;
  games?: GameDefinition[];
}

export function validateCatalog(input: CatalogInput = {}): string[] {
  const errors: string[] = [];
  const worlds = input.worlds ?? WORLDS;
  const games = input.games ?? GAMES;

  const worldSlugs = new Set<string>();
  for (const w of worlds) {
    if (worldSlugs.has(w.slug)) errors.push(`duplicate world slug "${w.slug}"`);
    worldSlugs.add(w.slug);
    if (!w.name.en) errors.push(`world "${w.slug}" missing English name`);
  }

  const seenSlugs = new Set<string>();
  const seenIds = new Set<string>();
  for (const g of games) {
    for (const e of validateGameDefinition(g)) errors.push(`${g.slug}: ${e}`);
    if (seenSlugs.has(g.slug)) errors.push(`duplicate game slug "${g.slug}"`);
    seenSlugs.add(g.slug);
    if (seenIds.has(g.id)) errors.push(`duplicate game id "${g.id}"`);
    seenIds.add(g.id);
    if (!worldSlugs.has(g.worldSlug)) {
      errors.push(`game "${g.slug}" references unknown world "${g.worldSlug}"`);
    }
    try {
      getScoringProfile(g.scoringProfile);
    } catch {
      errors.push(
        `game "${g.slug}" references unknown scoring profile "${g.scoringProfile}"`,
      );
    }
    try {
      getPromptSet(g.promptSource.ref);
    } catch {
      errors.push(
        `game "${g.slug}" references unknown prompt set "${g.promptSource.ref}"`,
      );
    }
    // gamesCompleted prerequisites must point at catalog games.
    const walkRule = (rule: UnlockRule): void => {
      if ("op" in rule) {
        for (const r of rule.rules) walkRule(r);
        return;
      }
      if (rule.type === "gamesCompleted") {
        for (const dep of rule.gameSlugs) {
          if (!seenSlugs.has(dep)) {
            errors.push(`game "${g.slug}" requires unknown game "${dep}"`);
          }
        }
      }
    };
    walkRule(g.unlockRule);
  }
  return errors;
}

export function catalogStats(games: GameDefinition[] = GAMES): {
  games: number;
  mechanics: number;
  modes: number;
  worlds: number;
} {
  return {
    games: games.length,
    mechanics: new Set(games.map((g) => g.mechanic)).size,
    modes: new Set(games.map((g) => g.mode)).size,
    worlds: new Set(games.map((g) => g.worldSlug)).size,
  };
}
