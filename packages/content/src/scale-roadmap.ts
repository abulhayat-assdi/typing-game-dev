/**
 * Content roadmaps (M19, Track B.14-15). RoadmapSlot is a planning record,
 * NOT a game definition: no prompt items, no assets, no DB rows. M20 turns
 * slots into BatchGameSpecs (real prompt sets, R2 art, i18n) through the
 * import workflow; validateRoadmap() guarantees the plan itself is sound:
 * unique slugs, valid cells, no fingerprint collisions, and the coverage
 * the final catalog requires (skills x mechanics x modes x worlds).
 */
import type { Difficulty, GameMode } from "@tap/game-engine";
import {
  fingerprintOf,
  type BatchReport,
} from "./scale-batch-validation";
import { DIFFICULTY_MATRIX, KIND_UNITS_BANDS, PLANNED_PROMPT_SETS, WORLD_MATRIX } from "./scale-matrices";
import { SKILL_FOCUSES, type SkillFocus } from "./scale-schema";
import { MECHANIC_TEMPLATES } from "./scale-templates";
import { GAMES } from "./games";
import { PROMPT_SETS, modesForKind, type PromptKind } from "./prompts";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export type RoadmapStatus = "shipped" | "planned";

export interface RoadmapSlot {
  slug: string;
  title: string;
  mechanic: string;
  mode: GameMode;
  difficulty: Difficulty;
  worldSlug: string;
  skillFocus: SkillFocus[];
  /** Existing PROMPT_SETS ref or PLANNED_PROMPT_SETS ref. */
  promptRef: string;
  units: number;
  timingKind: "untimed" | "countdown" | "countup";
  limitSeconds?: number;
  scoringProfile: string;
  status: RoadmapStatus;
  note?: string;
}

export interface RoadmapCoverage {
  minPerSkill: number;
  requiredMechanics: string[];
  minPerMechanic: number;
  requiredModes: GameMode[];
  minPerMode: number;
  worldMin: number;
  worldMax: number;
}

/** Compact slot authoring helper (positional to keep 200 rows readable). */
export function slot(
  slug: string,
  title: string,
  mechanic: string,
  mode: GameMode,
  difficulty: Difficulty,
  worldSlug: string,
  skillFocus: SkillFocus[],
  promptRef: string,
  units: number,
  timingKind: RoadmapSlot["timingKind"],
  limitSeconds: number | undefined,
  scoringProfile: string,
  status: RoadmapStatus = "planned",
  note?: string,
): RoadmapSlot {
  return {
    slug, title, mechanic, mode, difficulty, worldSlug, skillFocus,
    promptRef, units, timingKind, scoringProfile, status,
    ...(limitSeconds === undefined ? {} : { limitSeconds }),
    ...(note === undefined ? {} : { note }),
  };
}

/**
 * Shipped skill focuses (hand-curated, test-checked against GAMES slugs).
 * Lets roadmaps derive their shipped rows straight from the catalog so
 * the plan can never drift from what actually shipped.
 */
export const SHIPPED_SKILLS: Record<string, SkillFocus[]> = {
  "find-the-key": ["key-recognition"],
  "key-hunter": ["key-recognition", "collection"],
  "home-row-harbor": ["finger-placement", "letter-accuracy"],
  "finger-forge": ["finger-placement"],
  "letter-rain": ["letter-accuracy"],
  "letter-hunt": ["collection", "letter-accuracy"],
  "letter-maze": ["escape", "letter-accuracy"],
  "word-builder": ["word-construction"],
  "word-catcher": ["word-reaction", "collection"],
  "word-sprint": ["speed", "word-reaction"],
  "word-ninja": ["word-reaction", "accuracy"],
  "sentence-steps": ["sentence-typing", "word-construction"],
  "sentence-run": ["race", "sentence-typing"],
  "sentence-river": ["escape", "sentence-typing"],
  "minute-dash": ["speed", "competitive-preparation"],
  "two-minute-trail": ["endless-endurance", "speed"],
  "speed-tunnel": ["race", "speed"],
  "accuracy-temple": ["accuracy", "mixed-input"],
  "combo-canyon": ["survival", "mixed-input"],
  "no-mistake-bridge": ["survival", "accuracy"],
  "jungle-escape": ["escape", "sentence-typing"],
  "sky-typist": ["race", "word-reaction"],
  "space-run": ["escape", "mixed-input"],
  "word-sniper": ["accuracy", "word-reaction"],
  "sentence-blitz": ["speed", "sentence-typing"],
  "precision-grid": ["symbols", "accuracy"],
};

/** Derive shipped roadmap rows from the live catalog. */
export function shippedSlots(): RoadmapSlot[] {
  return GAMES.map((g) => {
    const row: RoadmapSlot = {
      slug: g.slug,
      title: g.title.en,
      mechanic: g.mechanic,
      mode: g.mode,
      difficulty: g.difficulty,
      worldSlug: g.worldSlug,
      skillFocus: SHIPPED_SKILLS[g.slug] ?? ["mixed-input"],
      promptRef: g.promptSource.ref,
      units: g.promptSource.units,
      timingKind: g.timingRules.kind,
      scoringProfile: g.scoringProfile,
      status: "shipped",
    };
    if (g.timingRules.kind !== "untimed" && g.timingRules.limitSeconds !== undefined) {
      row.limitSeconds = g.timingRules.limitSeconds;
    }
    return row;
  });
}

function promptKindOf(ref: string): PromptKind | undefined {
  const live = PROMPT_SETS[ref];
  if (live) return live.kind;
  return PLANNED_PROMPT_SETS.find((p) => p.ref === ref)?.kind;
}

export function validateRoadmap(
  slots: RoadmapSlot[],
  coverage: RoadmapCoverage,
): BatchReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenSlugs = new Set<string>();
  const seenFingerprints = new Map<string, string>();
  const perSkill: Record<string, number> = {};
  const perMechanic: Record<string, number> = {};
  const perMode: Record<string, number> = {};
  const perWorld: Record<string, number> = {};
  const worldSlugs = new Set(WORLD_MATRIX.map((w) => w.slug));

  const shippedPrints = new Map<string, string>();
  for (const g of shippedSlots()) {
    shippedPrints.set(
      fingerprintOf({
        mechanic: g.mechanic, mode: g.mode, difficulty: g.difficulty,
        promptRef: g.promptRef, timingKind: g.timingKind,
        limitSeconds: g.limitSeconds, scoringProfile: g.scoringProfile,
        units: g.units,
      }),
      g.slug,
    );
  }

  for (const s of slots) {
    const tag = `roadmap "${s.slug}"`;
    if (!SLUG_RE.test(s.slug)) errors.push(`${tag}: invalid slug shape`);
    if (seenSlugs.has(s.slug)) errors.push(`${tag}: duplicate slot slug`);
    seenSlugs.add(s.slug);

    if (!MECHANIC_TEMPLATES[s.mechanic]) {
      errors.push(`${tag}: unknown mechanic "${s.mechanic}"`);
      continue;
    }
    if (!worldSlugs.has(s.worldSlug)) errors.push(`${tag}: unknown world "${s.worldSlug}"}`);

    for (const skill of s.skillFocus) {
      if (!SKILL_FOCUSES.includes(skill)) {
        errors.push(`${tag}: unknown skillFocus "${skill}"`);
      }
      perSkill[skill] = (perSkill[skill] ?? 0) + 1;
    }
    perMechanic[s.mechanic] = (perMechanic[s.mechanic] ?? 0) + 1;
    perMode[s.mode] = (perMode[s.mode] ?? 0) + 1;
    perWorld[s.worldSlug] = (perWorld[s.worldSlug] ?? 0) + 1;

    const kind = promptKindOf(s.promptRef);
    if (!kind) {
      errors.push(`${tag}: prompt ref "${s.promptRef}" is neither shipped nor planned`);
    } else {
      if (!modesForKind(kind).includes(s.mode)) {
        errors.push(`${tag}: prompt kind "${kind}" cannot serve mode "${s.mode}"`);
      }
      const kindBand = KIND_UNITS_BANDS[kind];
      const cell = DIFFICULTY_MATRIX[s.difficulty];
      const lo = kindBand?.min ?? cell.unitsMin;
      const hi = kindBand?.max ?? cell.unitsMax;
      if (s.units < lo || s.units > hi) {
        errors.push(`${tag}: units ${String(s.units)} outside band ${String(lo)}-${String(hi)}`);
      }
    }

    const fingerprint = fingerprintOf({
      mechanic: s.mechanic, mode: s.mode, difficulty: s.difficulty,
      promptRef: s.promptRef, timingKind: s.timingKind,
      limitSeconds: s.limitSeconds, scoringProfile: s.scoringProfile,
      units: s.units,
    });
    const dup = seenFingerprints.get(fingerprint);
    if (dup) errors.push(`${tag}: fingerprint collision with slot "${dup}"`);
    else seenFingerprints.set(fingerprint, s.slug);
    if (s.status === "planned") {
      const shippedHit = shippedPrints.get(fingerprint);
      if (shippedHit) errors.push(`${tag}: fingerprint collision with shipped game "${shippedHit}"`);
    }
  }

  // Coverage gates.
  for (const skill of SKILL_FOCUSES) {
    const have = perSkill[skill] ?? 0;
    if (have < coverage.minPerSkill) {
      errors.push(`coverage: skill "${skill}" has ${String(have)} slots, need ${String(coverage.minPerSkill)}`);
    }
  }
  for (const mechanic of coverage.requiredMechanics) {
    const have = perMechanic[mechanic] ?? 0;
    if (have < coverage.minPerMechanic) {
      errors.push(`coverage: mechanic "${mechanic}" has ${String(have)} slots, need ${String(coverage.minPerMechanic)}`);
    }
  }
  for (const mode of coverage.requiredModes) {
    const have = perMode[mode] ?? 0;
    if (have < coverage.minPerMode) {
      errors.push(`coverage: mode "${mode}" has ${String(have)} slots, need ${String(coverage.minPerMode)}`);
    }
  }
  for (const w of WORLD_MATRIX) {
    const count = perWorld[w.slug] ?? 0;
    if (count < coverage.worldMin || count > coverage.worldMax) {
      errors.push(`coverage: world "${w.slug}" has ${String(count)} slots, need ${String(coverage.worldMin)}-${String(coverage.worldMax)}`);
    }
  }
  return { errors, warnings };
}
