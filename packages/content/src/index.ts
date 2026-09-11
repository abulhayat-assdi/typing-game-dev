/** @tap/content — data-driven catalog: worlds, games, prompts, difficulties (M4). */
export {
  CATALOG_VERSION,
  catalogStats,
  validateCatalog,
  type CatalogInput,
} from "./catalog";
export {
  DIFFICULTY_PROFILES,
  getDifficultyProfile,
  type DifficultyProfile,
} from "./difficulties";
export { GAMES } from "./games";
export {
  PROMPT_SETS,
  buildPrompt,
  getPromptSet,
  hashSeed,
  modesForKind,
  mulberry32,
  type BuiltPrompt,
  type PromptKind,
  type PromptSet,
} from "./prompts";
export { WORLDS, type World } from "./worlds";
