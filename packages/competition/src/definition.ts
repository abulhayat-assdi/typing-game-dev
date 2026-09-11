/**
 * Structural validation for competition definitions (M8). Empty = valid.
 * Invalid definitions can never reach the database or clients.
 */
import type { CompetitionDefinition } from "./types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const TYPES = [
  "SOLO", "BATCH", "TIMED", "SCORE_ATTACK", "ACCURACY", "SPEED",
  "ENDURANCE", "MULTI_ROUND", "CLAN", "CLAN_WAR", "TOURNAMENT", "RELAY",
  "SEASONAL",
];

const POLICIES = [
  "BEST_SCORE", "BEST_ACCURACY", "BEST_WPM", "LATEST_VALID", "AVERAGE_TOP_3",
];

const STRATEGIES = [
  "SUM", "AVERAGE", "TOP_N", "AVERAGE_TOP_N", "BEST_PLAYER",
  "PARTICIPATION_WEIGHTED",
];

const TIE_KEYS = ["score", "accuracy", "wpm", "errors", "earliest"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateCompetitionDefinition(def: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(def)) return ["definition must be an object"];
  const d: Record<string, unknown> = def;

  if (typeof d.slug !== "string" || !SLUG_RE.test(d.slug)) {
    errors.push("slug must match /^[a-z0-9][a-z0-9-]*$/");
  }
  if (!isRecord(d.title) || typeof d.title.en !== "string" || d.title.en === "") {
    errors.push("title.en must be a non-empty string");
  }
  if (typeof d.type !== "string" || !TYPES.includes(d.type)) {
    errors.push(`type must be one of ${TYPES.join(", ")}`);
  }
  if (!Array.isArray(d.gameSlugs) || d.gameSlugs.length === 0) {
    errors.push("gameSlugs must be a non-empty array");
  }
  const startsAt = typeof d.startsAt === "string" ? Date.parse(d.startsAt) : NaN;
  const endsAt = typeof d.endsAt === "string" ? Date.parse(d.endsAt) : NaN;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    errors.push("startsAt/endsAt must be valid timestamps");
  } else if (!(endsAt > startsAt)) {
    errors.push("endsAt must be after startsAt");
  }
  const regStart =
    d.registrationStartsAt === null || d.registrationStartsAt === undefined
      ? null
      : Date.parse(d.registrationStartsAt as string);
  const regEnd =
    d.registrationEndsAt === null || d.registrationEndsAt === undefined
      ? null
      : Date.parse(d.registrationEndsAt as string);
  if (regStart !== null && !Number.isFinite(regStart)) {
    errors.push("registrationStartsAt must be a valid timestamp or null");
  }
  if (regEnd !== null && !Number.isFinite(regEnd)) {
    errors.push("registrationEndsAt must be a valid timestamp or null");
  }
  if (regStart !== null && regEnd !== null && !(regEnd > regStart)) {
    errors.push("registrationEndsAt must be after registrationStartsAt");
  }
  if (
    typeof d.attemptLimit !== "number" ||
    !Number.isInteger(d.attemptLimit) ||
    !(d.attemptLimit > 0)
  ) {
    errors.push("attemptLimit must be a positive integer");
  }
  if (
    !isRecord(d.scoring) ||
    !["wpm", "accuracy", "score", "hybrid"].includes(d.scoring.metric as string)
  ) {
    errors.push("scoring.metric must be wpm|accuracy|score|hybrid");
  }
  if (
    !Array.isArray(d.tieBreakers) ||
    d.tieBreakers.length === 0 ||
    !d.tieBreakers.every(
      (t): t is string => typeof t === "string" && TIE_KEYS.includes(t),
    )
  ) {
    errors.push("tieBreakers must be a non-empty tie-break list");
  }
  if (typeof d.attemptPolicy !== "string" || !POLICIES.includes(d.attemptPolicy)) {
    errors.push(`attemptPolicy must be one of ${POLICIES.join(", ")}`);
  }
  if (
    d.aggregateStrategy !== undefined &&
    (typeof d.aggregateStrategy !== "string" ||
      !STRATEGIES.includes(d.aggregateStrategy))
  ) {
    errors.push(`aggregateStrategy must be one of ${STRATEGIES.join(", ")}`);
  }
  if (typeof d.version !== "number" || !Number.isInteger(d.version) || d.version < 1) {
    errors.push("version must be an integer >= 1");
  }
  return errors;
}

export type { CompetitionDefinition };
