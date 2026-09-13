/**
 * Scale-up foundation tests (M19, Track B). Validators, templates, matrices,
 * and roadmaps share one suite so the import pipeline and the docs can never
 * disagree. The grandfather tests prove the new rules accept everything
 * already shipped — strictness applies to future batches, never rewrites
 * history.
 */
import { describe, expect, it } from "vitest";
import { validateGameDefinition, type GameDefinition } from "@tap/game-engine";
import { listScoringProfiles } from "@tap/scoring";
import {
  catalogBatchContext,
  printsForBatch,
  validateGameBatch,
} from "./scale-batch-validation";
import { getMechanicTemplate } from "./scale-templates";
import type { BatchGameSpec } from "./scale-schema";
import { GAMES } from "./games";
import { PROMPT_SETS } from "./prompts";
import {
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
} from "./scale-matrices";
import { ROADMAP_100, ROADMAP_100_COVERAGE } from "./scale-roadmap-100";
import { ROADMAP_200, ROADMAP_200_COVERAGE } from "./scale-roadmap-200";
import {
  SHIPPED_SKILLS,
  shippedSlots,
  validateRoadmap,
} from "./scale-roadmap";
import {
  SKILL_FOCUSES,
  requiredAssetsFor,
  toGameDefinition,
} from "./scale-schema";
import { MECHANIC_TEMPLATES } from "./scale-templates";

function baseSpec(overrides: Partial<BatchGameSpec> = {}): BatchGameSpec {
  return {
    slug: "batch-probe",
    title: { en: "Probe", bn: "Probe" },
    description: { en: "Probe game", bn: "Probe game" },
    worldSlug: "desert-rally",
    category: "probe",
    mechanic: "duel-rounds",
    mode: "word",
    difficulty: "beginner",
    skillBands: ["beginner"],
    skillFocus: ["competitive-preparation"],
    promptRef: "beginner-words",
    units: 10,
    timingKind: "countdown",
    limitSeconds: 45,
    scoringProfile: "speed",
    unlockRule: { type: "open" },
    theme: { visual: "dune", audio: "driving" },
    config: { rounds: 3, roundSeconds: 45 },
    missionTags: ["duel-week"],
    rewardEventKeys: ["duel-complete"],
    competitionEligible: false,
    ...overrides,
  };
}

function gameToSpec(g: GameDefinition): BatchGameSpec {
  const spec: BatchGameSpec = {
    slug: g.slug,
    title: { ...g.title },
    description: { ...g.description },
    worldSlug: g.worldSlug,
    category: g.category,
    mechanic: g.mechanic,
    mode: g.mode,
    difficulty: g.difficulty,
    skillBands: [...g.skillBands],
    skillFocus: SHIPPED_SKILLS[g.slug] ?? ["mixed-input"],
    promptRef: g.promptSource.ref,
    units: g.promptSource.units,
    timingKind: g.timingRules.kind,
    scoringProfile: g.scoringProfile,
    unlockRule: g.unlockRule,
    attemptRules: { ...g.attemptRules },
    inputRules: { ...g.inputRules },
    theme: { ...g.theme },
    config: { ...g.config },
    competitionEligible: g.competitionEligible,
  };
  if (g.timingRules.kind !== "untimed" && g.timingRules.limitSeconds !== undefined) {
    spec.limitSeconds = g.timingRules.limitSeconds;
  }
  return spec;
}

describe("mechanic templates", () => {
  it("covers all 14 mechanics with sane defaults", () => {
    expect(Object.keys(MECHANIC_TEMPLATES)).toHaveLength(14);
    const profiles = new Set(listScoringProfiles().map((p) => p.id));
    for (const t of Object.values(MECHANIC_TEMPLATES)) {
      expect(t.supportedModes.length).toBeGreaterThan(0);
      expect(profiles.has(t.defaultScoring)).toBe(true);
      expect(t.requiredConfig.length).toBeGreaterThan(0);
      expect(t.suggestedSkills.length).toBeGreaterThan(0);
      expect(t.renderer.contract.length).toBeGreaterThan(10);
    }
  });

  it("marks 9 shipped renderers and 5 M20 renderers", () => {
    const shipped = Object.values(MECHANIC_TEMPLATES).filter((t) => t.renderer.status === "shipped");
    const m20 = Object.values(MECHANIC_TEMPLATES).filter((t) => t.renderer.status === "m20");
    expect(shipped).toHaveLength(9);
    expect(m20.map((t) => t.mechanic).sort()).toEqual([...UNUSED_MECHANICS].sort());
  });
});

describe("matrices", () => {
  it("placements match the shipped catalog exactly", () => {
    expect(MECHANIC_MODE_PLACEMENTS).toHaveLength(GAMES.length);
    const bySlug = new Map(GAMES.map((g) => [g.slug, g]));
    for (const p of MECHANIC_MODE_PLACEMENTS) {
      const g = bySlug.get(p.gameSlug);
      expect(g, `placement ${p.gameSlug} exists`).toBeDefined();
      expect(p.mechanic).toBe(g?.mechanic);
      expect(p.mode).toBe(g?.mode);
      expect(p.difficulty).toBe(g?.difficulty);
    }
  });

  it("unused mechanics and modes have zero placements", () => {
    for (const m of UNUSED_MECHANICS) {
      expect(MECHANIC_MODE_PLACEMENTS.some((p) => p.mechanic === m)).toBe(false);
    }
    for (const mode of UNUSED_MODES) {
      expect(MECHANIC_MODE_PLACEMENTS.some((p) => p.mode === mode)).toBe(false);
    }
  });

  it("world matrix mirrors catalog worlds and sums to 100/200", () => {
    expect(matrixWorldSlugs().sort()).toEqual(catalogWorldSlugs().sort());
    expect(WORLD_MATRIX).toHaveLength(16);
    expect(WORLD_MATRIX.reduce((n, w) => n + w.capacity100, 0)).toBe(100);
    expect(WORLD_MATRIX.reduce((n, w) => n + w.capacity200, 0)).toBe(200);
    const counts = shippedCountsByWorld();
    expect(Object.values(counts).reduce((n, c) => n + c, 0)).toBe(GAMES.length);
  });

  it("difficulty bands contain every shipped game", () => {
    for (const g of GAMES) {
      const cell = DIFFICULTY_MATRIX[g.difficulty];
      expect(g.promptSource.units).toBeGreaterThanOrEqual(cell.unitsMin);
      expect(g.promptSource.units).toBeLessThanOrEqual(cell.unitsMax);
    }
  });

  it("planned prompt sets are collision-free with valid kinds", () => {
    for (const p of PLANNED_PROMPT_SETS) {
      expect(PROMPT_SETS[p.ref]).toBeUndefined();
      expect(["numbers", "symbols", "words", "sentences", "paragraphs", "shortcuts"]).toContain(p.kind);
    }
    expect(KIND_UNITS_BANDS.paragraphs).toEqual({ min: 1, max: 8 });
  });
});

describe("batch validator rejection classes", () => {
  const assets = requiredAssetsFor("batch-probe");
  const ctx = () =>
    catalogBatchContext({
      assetKeys: assets,
      rewardRegistry: ["duel-complete"],
    });

  it("accepts a valid spec with zero errors", () => {
    expect(validateGameBatch([baseSpec()], ctx()).errors).toEqual([]);
  });

  it("expands specs to structurally valid definitions (no-core-code proof)", () => {
    const def = toGameDefinition(baseSpec(), getMechanicTemplate("duel-rounds"));
    expect(validateGameDefinition(def)).toEqual([]);
    expect(def.slug).toBe("batch-probe");
  });

  it("rejects duplicate slugs (catalog + in-batch)", () => {
    const dupCatalog = validateGameBatch(
      [baseSpec({ slug: "find-the-key" })], ctx(),
    );
    expect(dupCatalog.errors.some((e) => e.includes("already exists"))).toBe(true);
    const dupBatch = validateGameBatch(
      [baseSpec({ slug: "same-slug" }), baseSpec({ slug: "same-slug" })], ctx(),
    );
    expect(dupBatch.errors.some((e) => e.includes("within batch"))).toBe(true);
  });

  it("rejects near-clones of shipped games", () => {
    const clone = validateGameBatch(
      [
        baseSpec({
          slug: "minute-clone",
          mechanic: "time-trial",
          mode: "mixed",
          difficulty: "intermediate",
          promptRef: "standard-sentences",
          units: 12,
          timingKind: "countdown",
          limitSeconds: 60,
          scoringProfile: "speed",
        }),
      ],
      ctx(),
    );
    expect(clone.errors.some((e) => e.includes("minute-dash"))).toBe(true);
  });

  it("rejects unknown prompt sets and kind/mode mismatches", () => {
    const unknown = validateGameBatch([baseSpec({ promptRef: "nope" })], ctx());
    expect(unknown.errors.some((e) => e.includes("unknown prompt set"))).toBe(true);
    const mismatch = validateGameBatch(
      [baseSpec({ promptRef: "home-row", mode: "word" })], ctx(),
    );
    expect(mismatch.errors.some((e) => e.includes("cannot serve mode"))).toBe(true);
  });

  it("rejects out-of-band units and unknown worlds/profiles", () => {
    const units = validateGameBatch([baseSpec({ units: 500 })], ctx());
    expect(units.errors.some((e) => e.includes("outside"))).toBe(true);
    const world = validateGameBatch([baseSpec({ worldSlug: "nope" })], ctx());
    expect(world.errors.some((e) => e.includes("unknown world"))).toBe(true);
    const scoring = validateGameBatch([baseSpec({ scoringProfile: "nope" })], ctx());
    expect(scoring.errors.some((e) => e.includes("unknown scoring"))).toBe(true);
  });

  it("rejects dangling unlock refs and bad skill focuses", () => {
    const unlock = validateGameBatch(
      [baseSpec({ unlockRule: { type: "gamesCompleted", gameSlugs: ["ghost-game"] } })],
      ctx(),
    );
    expect(unlock.errors.some((e) => e.includes("unknown game"))).toBe(true);
    const skill = validateGameBatch(
      [baseSpec({ skillFocus: ["typing-like-a-demon"] as never })], ctx(),
    );
    expect(skill.errors.some((e) => e.includes("skillFocus"))).toBe(true);
  });

  it("rejects bad reward hooks and malformed mission tags", () => {
    const unregistered = validateGameBatch(
      [baseSpec({ rewardEventKeys: ["phantom-reward"] })], ctx(),
    );
    expect(unregistered.errors.some((e) => e.includes("unregistered"))).toBe(true);
    const tags = validateGameBatch([baseSpec({ missionTags: ["Bad Tag!"] })], ctx());
    expect(tags.errors.some((e) => e.includes("mission tag"))).toBe(true);
  });

  it("rejects missing translations when bn is required, warns otherwise", () => {
    const noBn = baseSpec({ title: { en: "No Bn" }, description: { en: "No Bn" } });
    expect(validateGameBatch([noBn], ctx()).errors).toEqual([]);
    expect(validateGameBatch([noBn], ctx()).warnings.length).toBeGreaterThan(0);
    const strict = catalogBatchContext({ requireBn: true });
    expect(
      validateGameBatch([noBn], strict).errors.some((e) => e.includes("Bangla")),
    ).toBe(true);
  });

  it("rejects missing R2 assets when a listing is supplied", () => {
    const missing = validateGameBatch(
      [baseSpec()], catalogBatchContext({ assetKeys: [] }),
    );
    expect(missing.errors.some((e) => e.includes("missing R2 asset"))).toBe(true);
  });

  it("grandfathers the shipped catalog (split-half, zero errors)", () => {
    const specs = GAMES.map(gameToSpec);
    const half = Math.ceil(specs.length / 2);
    const a = specs.slice(0, half);
    const b = specs.slice(half);
    const assetsFor = (list: BatchGameSpec[]): string[] =>
      list.flatMap((s) => requiredAssetsFor(s.slug));
    const reportA = validateGameBatch(
      a,
      catalogBatchContext({
        existingSlugs: b.map((s) => s.slug),
        existingPrints: printsForBatch(b),
        assetKeys: assetsFor(a),
      }),
    );
    expect(reportA.errors).toEqual([]);
    const reportB = validateGameBatch(
      b,
      catalogBatchContext({
        existingSlugs: a.map((s) => s.slug),
        existingPrints: printsForBatch(a),
        assetKeys: assetsFor(b),
      }),
    );
    expect(reportB.errors).toEqual([]);
  });
});

describe("roadmaps", () => {
  it("first hundred is 26 shipped + 74 planned and validates clean", () => {
    expect(ROADMAP_100).toHaveLength(100);
    expect(ROADMAP_100.filter((s) => s.status === "shipped")).toHaveLength(26);
    expect(ROADMAP_100.filter((s) => s.status === "planned")).toHaveLength(74);
    const report = validateRoadmap(ROADMAP_100, ROADMAP_100_COVERAGE);
    expect(report.errors).toEqual([]);
  });

  it("full two hundred validates clean at the 200 scale", () => {
    expect(ROADMAP_200).toHaveLength(200);
    const report = validateRoadmap(ROADMAP_200, ROADMAP_200_COVERAGE);
    expect(report.errors).toEqual([]);
  });

  it("shipped skill map covers every catalog game", () => {
    for (const g of GAMES) {
      expect(SHIPPED_SKILLS[g.slug]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(shippedSlots()).toHaveLength(GAMES.length);
  });

  it("covers all 21 skills", () => {
    expect(SKILL_FOCUSES).toHaveLength(21);
  });
});
