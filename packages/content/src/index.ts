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
export {
  SKILL_FOCUSES,
  requiredAssetsFor,
  toGameDefinition,
  MISSION_TAG_RE,
  REWARD_KEY_RE,
  type BatchGameSpec,
  type MechanicTemplate,
  type SkillFocus,
} from "./scale-schema";
export {
  MECHANIC_TEMPLATES,
  getMechanicTemplate,
} from "./scale-templates";
export {
  DIFFICULTY_MATRIX,
  KIND_UNITS_BANDS,
  MECHANIC_MODE_PLACEMENTS,
  PLANNED_PROMPT_SETS,
  UNUSED_MECHANICS,
  UNUSED_MODES,
  WORLD_MATRIX,
  catalogWorldSlugs,
  matrixWorldSlugs,
  shippedCountsByWorld,
  type DifficultyCell,
  type MechanicPlacement,
  type PlannedPromptSet,
  type WorldCell,
} from "./scale-matrices";
export {
  catalogBatchContext,
  cellOf,
  fingerprintOf,
  printsForBatch,
  validateGameBatch,
  type BatchContext,
  type BatchReport,
  type CatalogPrint,
} from "./scale-batch-validation";
export {
  ROADMAP_100_COVERAGE,
  ROADMAP_100,
} from "./scale-roadmap-100";
export {
  ROADMAP_200_COVERAGE,
  ROADMAP_200,
} from "./scale-roadmap-200";
export {
  SHIPPED_SKILLS,
  shippedSlots,
  slot,
  validateRoadmap,
  type RoadmapCoverage,
  type RoadmapSlot,
  type RoadmapStatus,
} from "./scale-roadmap";
