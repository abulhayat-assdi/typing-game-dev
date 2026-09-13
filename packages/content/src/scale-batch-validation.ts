/**
 * Batch validation for content scale-up (M19, Track B). The import pipeline
 * (scripts/import-content-batch.ts + pnpm validate:content) rejects batches
 * that violate any rule below. Checks are pure and injectable so tests and
 * the CLI share exactly one implementation.
 *
 * Rejection classes (M19 architecture rule):
 *  1. duplicate slugs (in-batch or against the catalog)
 *  2. duplicate mechanic x mode near-clones (fingerprint collision)
 *  3. missing prompt sets
 *  4. invalid difficulty cells (kind/mode mismatch or units out of band)
 *  5. invalid unlock references (gamesCompleted pointing nowhere)
 *  6. invalid reward hooks (malformed or unregistered keys)
 *  7. missing translations (en required; bn required only when asked)
 *  8. missing R2 assets (when an asset listing is supplied)
 */
import { listScoringProfiles } from "@tap/scoring";
import { validateGameDefinition } from "@tap/game-engine";
import { DIFFICULTY_MATRIX, KIND_UNITS_BANDS } from "./scale-matrices";
import {
  MISSION_TAG_RE,
  REWARD_KEY_RE,
  requiredAssetsFor,
  SKILL_FOCUSES,
  toGameDefinition,
  type BatchGameSpec,
} from "./scale-schema";
import { getMechanicTemplate } from "./scale-templates";
import { GAMES } from "./games";
import { WORLDS } from "./worlds";
import { PROMPT_SETS, modesForKind, type PromptKind } from "./prompts";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface CatalogPrint {
  fingerprint: string;
  cell: string;
  slug: string;
}

export interface BatchContext {
  existingSlugs: string[];
  /** Fingerprints + cells of shipped games (near-clone baseline). */
  existingPrints: CatalogPrint[];
  promptKinds: Record<string, string>;
  scoringProfiles: string[];
  worldSlugs: string[];
  /** Known reward_events keys; unknown keys rejected only when provided. */
  rewardRegistry?: string[];
  /** R2 key listing; missing assets rejected only when provided. */
  assetKeys?: string[];
  /** When true, missing bn title/description is an error (else warning). */
  requireBn?: boolean;
}

export interface BatchReport {
  errors: string[];
  warnings: string[];
}

/**
 * Near-clone fingerprint: same cell, same timing, same scoring, same
 * session length = clone. `units` is part of the fingerprint so the two
 * shipped letter-collection drills (units 12 vs 15) stay valid; a spec
 * that matches on everything EXCEPT units raises a variant warning and
 * must justify the session-length difference (see cellOf).
 */
export function fingerprintOf(spec: {
  mechanic: string;
  mode: string;
  difficulty: string;
  promptRef: string;
  timingKind: string;
  limitSeconds: number | undefined;
  scoringProfile: string;
  units: number;
}): string {
  return [
    spec.mechanic,
    spec.mode,
    spec.difficulty,
    spec.promptRef,
    spec.timingKind,
    spec.limitSeconds ?? "-",
    spec.scoringProfile,
    String(spec.units),
  ].join("|");
}

/** The fingerprint minus units: matches mean units-only variants. */
export function cellOf(
  spec: Omit<Parameters<typeof fingerprintOf>[0], "units">,
): string {
  return [
    spec.mechanic,
    spec.mode,
    spec.difficulty,
    spec.promptRef,
    spec.timingKind,
    spec.limitSeconds ?? "-",
    spec.scoringProfile,
  ].join("|");
}

function specPrints(g: {
  mechanic: string;
  mode: string;
  difficulty: string;
  promptRef: string;
  timingKind: string;
  limitSeconds: number | undefined;
  scoringProfile: string;
  units: number;
}): { fingerprint: string; cell: string } {
  return { fingerprint: fingerprintOf(g), cell: cellOf(g) };
}

function shippedPrints(): { fingerprint: string; cell: string; slug: string }[] {
  return GAMES.map((g) => {
    const limit =
      g.timingRules.kind === "untimed" ? undefined : g.timingRules.limitSeconds;
    const base = {
      mechanic: g.mechanic,
      mode: g.mode,
      difficulty: g.difficulty,
      promptRef: g.promptSource.ref,
      timingKind: g.timingRules.kind,
      limitSeconds: limit,
      scoringProfile: g.scoringProfile,
      units: g.promptSource.units,
    };
    return { ...specPrints(base), slug: g.slug };
  });
}

/** Compute fingerprints for specs (split-half grandfathering, import diffing). */
export function printsForBatch(specs: BatchGameSpec[]): CatalogPrint[] {
  return specs.map((s) => ({
    ...specPrints({
      mechanic: s.mechanic,
      mode: s.mode,
      difficulty: s.difficulty,
      promptRef: s.promptRef,
      timingKind: s.timingKind,
      limitSeconds: s.limitSeconds,
      scoringProfile: s.scoringProfile,
      units: s.units,
    }),
    slug: s.slug,
  }));
}

/** Default context derived from the live catalog (no DB needed). */
export function catalogBatchContext(overrides: Partial<BatchContext> = {}): BatchContext {
  const kinds: Record<string, string> = {};
  for (const [ref, set] of Object.entries(PROMPT_SETS)) kinds[ref] = set.kind;
  return {
    existingSlugs: GAMES.map((g) => g.slug),
    existingPrints: shippedPrints(),
    promptKinds: kinds,
    scoringProfiles: listScoringProfiles().map((p) => p.id),
    worldSlugs: WORLDS.map((w) => w.slug),
    ...overrides,
  };
}

function walkUnlockRefs(
  rule: BatchGameSpec["unlockRule"],
  into: string[],
): void {
  if ("op" in rule) {
    for (const r of rule.rules) walkUnlockRefs(r, into);
    return;
  }
  if (rule.type === "gamesCompleted") into.push(...rule.gameSlugs);
}

export function validateGameBatch(
  specs: BatchGameSpec[],
  ctx: BatchContext,
): BatchReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const batchSlugs = new Set<string>();
  const batchFingerprints = new Set<string>();
  const batchCells = new Map<string, string>();
  const knownSlugs = new Set([...ctx.existingSlugs, ...specs.map((s) => s.slug)]);

  for (const spec of specs) {
    const tag = `batch "${spec.slug}"`;

    // 1. duplicate slugs.
    if (!SLUG_RE.test(spec.slug)) errors.push(`${tag}: invalid slug shape`);
    if (batchSlugs.has(spec.slug)) errors.push(`${tag}: duplicate slug within batch`);
    batchSlugs.add(spec.slug);
    if (ctx.existingSlugs.includes(spec.slug)) {
      errors.push(`${tag}: slug already exists in catalog`);
    }

    // Structural expansion through the mechanic template.
    let template;
    try {
      template = getMechanicTemplate(spec.mechanic);
    } catch {
      errors.push(`${tag}: unknown mechanic "${spec.mechanic}"`);
      continue;
    }
    for (const e of validateGameDefinition(toGameDefinition(spec, template))) {
      errors.push(`${tag}: ${e}`);
    }

    // skillFocus allow-list.
    if (!Array.isArray(spec.skillFocus) || spec.skillFocus.length < 1 || spec.skillFocus.length > 3) {
      errors.push(`${tag}: skillFocus needs 1-3 entries`);
    } else {
      for (const skill of spec.skillFocus) {
        if (!SKILL_FOCUSES.includes(skill)) {
          errors.push(`${tag}: unknown skillFocus "${skill}"`);
        }
      }
    }

    // 2. near-clone fingerprint (units included) + units-only variant tripwire.
    const prints = specPrints({
      mechanic: spec.mechanic,
      mode: spec.mode,
      difficulty: spec.difficulty,
      promptRef: spec.promptRef,
      timingKind: spec.timingKind,
      limitSeconds: spec.limitSeconds,
      scoringProfile: spec.scoringProfile,
      units: spec.units,
    });
    if (batchFingerprints.has(prints.fingerprint)) {
      errors.push(
        `${tag}: near-clone of another batch game (same mechanic x mode x difficulty x prompt x timing x scoring x units — differentiate timing, prompt set, scoring profile, or session length)`,
      );
    }
    batchFingerprints.add(prints.fingerprint);
    const batchCellHit = [...batchCells.entries()].find(([cell]) => cell === prints.cell);
    if (batchCellHit && batchCellHit[1] !== spec.slug) {
      warnings.push(
        `${tag}: units-only variant of batch game "${batchCellHit[1]}" — justify the session-length difference`,
      );
    }
    batchCells.set(prints.cell, spec.slug);
    const shippedHit = ctx.existingPrints.find((p) => p.fingerprint === prints.fingerprint);
    if (shippedHit && shippedHit.slug !== spec.slug) {
      errors.push(
        `${tag}: near-clone of shipped game "${shippedHit.slug}" (same mechanic x mode x difficulty x prompt x timing x scoring x units)`,
      );
    }
    const shippedCellHit = ctx.existingPrints.find(
      (p) => p.cell === prints.cell && p.slug !== spec.slug,
    );
    if (shippedCellHit && !shippedHit) {
      warnings.push(
        `${tag}: units-only variant of shipped game "${shippedCellHit.slug}" — justify the session-length difference`,
      );
    }

    // 3. prompt set must exist (full specs need real, generatable content).
    const kind = ctx.promptKinds[spec.promptRef];
    if (!kind) {
      errors.push(`${tag}: unknown prompt set "${spec.promptRef}"`);
    } else {
      // 4. difficulty cell: kind must serve the mode; units within band.
      const served = modesForKind(kind as PromptKind);
      if (!served.includes(spec.mode)) {
        errors.push(
          `${tag}: prompt kind "${kind}" cannot serve mode "${spec.mode}"`,
        );
      }
      const kindBand = KIND_UNITS_BANDS[kind as PromptKind];
      const cell = DIFFICULTY_MATRIX[spec.difficulty];
      const unitsMin = kindBand?.min ?? cell.unitsMin;
      const unitsMax = kindBand?.max ?? cell.unitsMax;
      const bandName = kindBand ? `kind "${kind}"` : spec.difficulty;
      if (spec.units < unitsMin || spec.units > unitsMax) {
        errors.push(
          `${tag}: units ${String(spec.units)} outside ${bandName} band ${String(unitsMin)}-${String(unitsMax)}`,
        );
      }
      if (!cell.vocabSets.includes(spec.promptRef)) {
        warnings.push(
          `${tag}: prompt set "${spec.promptRef}" not in ${spec.difficulty} vocabSets (allowed with justification)`,
        );
      }
    }

    // World + scoring membership.
    if (!ctx.worldSlugs.includes(spec.worldSlug)) {
      errors.push(`${tag}: unknown world "${spec.worldSlug}"`);
    }
    if (!ctx.scoringProfiles.includes(spec.scoringProfile)) {
      errors.push(`${tag}: unknown scoring profile "${spec.scoringProfile}"`);
    }

    // 5. unlock references must resolve.
    const refs: string[] = [];
    walkUnlockRefs(spec.unlockRule, refs);
    for (const dep of refs) {
      if (!knownSlugs.has(dep)) {
        errors.push(`${tag}: unlock requires unknown game "${dep}"`);
      }
    }

    // 6. reward hooks.
    for (const key of spec.rewardEventKeys ?? []) {
      if (!REWARD_KEY_RE.test(key)) {
        errors.push(`${tag}: malformed reward key "${key}"`);
      } else if (ctx.rewardRegistry && !ctx.rewardRegistry.includes(key)) {
        errors.push(`${tag}: unregistered reward key "${key}"`);
      }
    }
    if (!spec.rewardEventKeys || spec.rewardEventKeys.length === 0) {
      warnings.push(`${tag}: no reward hook declared`);
    }

    // Mission tags.
    for (const t of spec.missionTags ?? []) {
      if (!MISSION_TAG_RE.test(t)) errors.push(`${tag}: malformed mission tag "${t}"`);
    }

    // 7. translations.
    if (!spec.title.bn || !spec.description.bn) {
      const message = `${tag}: missing Bangla title/description (falls back to English)`;
      if (ctx.requireBn) errors.push(message);
      else warnings.push(message);
    }

    // 8. R2 assets.
    if (ctx.assetKeys) {
      for (const key of requiredAssetsFor(spec.slug)) {
        if (!ctx.assetKeys.includes(key)) {
          errors.push(`${tag}: missing R2 asset "${key}"`);
        }
      }
    }

    // Template config guidance (warning only — renderers apply defaults).
    const missingConfig = template.requiredConfig.filter(
      (k) => !(spec.config ?? {})[k],
    );
    if (missingConfig.length > 0) {
      warnings.push(`${tag}: config missing template keys: ${missingConfig.join(", ")}`);
    }
  }
  return { errors, warnings };
}
