/**
 * Content pipeline gate (M19). Was an M1 stub; now enforces the full
 * scale-up contract: catalog integrity, mechanic templates, matrices,
 * batch-validator calibration, and both roadmaps. CI runs this on every
 * content change — a failing gate blocks the batch, never the release.
 *
 * Usage: pnpm validate:content
 */
import {
  GAMES,
  MECHANIC_TEMPLATES,
  ROADMAP_100,
  ROADMAP_100_COVERAGE,
  ROADMAP_200,
  ROADMAP_200_COVERAGE,
  WORLD_MATRIX,
  catalogBatchContext,
  validateCatalog,
  validateGameBatch,
  validateRoadmap,
  type BatchGameSpec,
} from "@tap/content";

function fail(message: string): never {
  console.error(`validate-content FAILED: ${message}`);
  process.exit(1);
}

const catalogErrors = validateCatalog();
if (catalogErrors.length > 0) {
  fail(`catalog invalid:\n- ${catalogErrors.join("\n- ")}`);
}

if (Object.keys(MECHANIC_TEMPLATES).length !== 14) {
  fail("mechanic templates must cover all 14 mechanics");
}

const worldTotal100 = WORLD_MATRIX.reduce((n, w) => n + w.capacity100, 0);
const worldTotal200 = WORLD_MATRIX.reduce((n, w) => n + w.capacity200, 0);
if (worldTotal100 !== 100 || worldTotal200 !== 200) {
  fail(`world capacities must sum to 100/200 (got ${worldTotal100}/${worldTotal200})`);
}

// Batch-validator calibration: the shipped catalog validates clean
// against itself (proves strictness targets future batches, not history).
const specs = GAMES.map((g): BatchGameSpec => {
  const timed = g.timingRules.kind !== "untimed";
  return {
    slug: g.slug,
    title: { ...g.title },
    description: { ...g.description },
    worldSlug: g.worldSlug,
    category: g.category,
    mechanic: g.mechanic,
    mode: g.mode,
    difficulty: g.difficulty,
    skillBands: [...g.skillBands],
    skillFocus: ["mixed-input"],
    promptRef: g.promptSource.ref,
    units: g.promptSource.units,
    timingKind: g.timingRules.kind,
    ...(timed && g.timingRules.limitSeconds !== undefined
      ? { limitSeconds: g.timingRules.limitSeconds }
      : {}),
    scoringProfile: g.scoringProfile,
    unlockRule: g.unlockRule,
    theme: { ...g.theme },
    competitionEligible: g.competitionEligible,
  };
});
const calibration = validateGameBatch(
  specs,
  catalogBatchContext({
    existingSlugs: [],
    existingPrints: [],
    assetKeys: specs.flatMap((s) => [
      `games/${s.slug}/preview.png`,
      `games/${s.slug}/art.png`,
    ]),
  }),
);
if (calibration.errors.length > 0) {
  fail(`validator miscalibrated on shipped catalog:\n- ${calibration.errors.join("\n- ")}`);
}

const roadmap100 = validateRoadmap(ROADMAP_100, ROADMAP_100_COVERAGE);
if (roadmap100.errors.length > 0) {
  fail(`roadmap-100 invalid:\n- ${roadmap100.errors.join("\n- ")}`);
}
const roadmap200 = validateRoadmap(ROADMAP_200, ROADMAP_200_COVERAGE);
if (roadmap200.errors.length > 0) {
  fail(`roadmap-200 invalid:\n- ${roadmap200.errors.join("\n- ")}`);
}

console.log(
  `validate-content OK — catalog=${GAMES.length} games, templates=14, ` +
    `roadmap100=${ROADMAP_100.length}, roadmap200=${ROADMAP_200.length}`,
);
