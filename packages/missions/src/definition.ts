/**
 * Mission definition validation (M9). Mirrors the CHECK constraints in
 * 0016; the database re-validates everything on write.
 */
import type { MissionDefinition, ObjectiveKind } from "./types";

const SLUG = /^[a-z0-9-]{1,80}$/;

const OBJECTIVE_KINDS: ReadonlySet<string> = new Set<string>([
  "GAMES_COMPLETED",
  "ACCURACY_REACHED",
  "WPM_REACHED",
  "SCORE_REACHED",
  "CHARS_TYPED",
  "WORDS_TYPED",
  "PERFECT_RUN",
  "DISTINCT_GAMES",
  "PERSONAL_BEST",
  "WORLD_GAMES",
]);

export function validateMissionDefinition(
  def: MissionDefinition,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!SLUG.test(def.slug)) errors.push("MALFORMED_SLUG");
  if (!def.title || def.title.length > 160) errors.push("MALFORMED_TITLE");
  if (def.objectives.length === 0) errors.push("NO_OBJECTIVES");
  const positions = new Set<number>();
  for (const o of def.objectives) {
    if (!OBJECTIVE_KINDS.has(o.kind)) {
      errors.push(`UNKNOWN_KIND_${o.kind}`);
    }
    if (positions.has(o.position)) errors.push("DUPLICATE_POSITION");
    positions.add(o.position);
    if (!needsThreshold(o.kind) && !isPositiveInt(o.target.count)) {
      errors.push(`MISSING_COUNT_${o.kind}`);
    }
    if (needsThreshold(o.kind) && !isPositiveNumber(o.target.threshold)) {
      errors.push(`MISSING_THRESHOLD_${o.kind}`);
    }
  }
  if (def.rewardXp < 0 || def.rewardCoins < 0) errors.push("NEGATIVE_REWARD");
  if (
    def.startsAt &&
    def.endsAt &&
    Date.parse(def.endsAt) <= Date.parse(def.startsAt)
  ) {
    errors.push("INVALID_WINDOW");
  }
  return { ok: errors.length === 0, errors };
}

function needsThreshold(kind: ObjectiveKind): boolean {
  return (
    kind === "ACCURACY_REACHED" ||
    kind === "WPM_REACHED" ||
    kind === "SCORE_REACHED"
  );
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
