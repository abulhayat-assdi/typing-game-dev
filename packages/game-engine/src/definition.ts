/**
 * Structural validation for game definitions (M4). Returns human-readable
 * errors; empty = valid. Used by content tests and the catalog seed loader —
 * invalid definitions can never reach the database or clients.
 */
import type {
  Difficulty,
  GameDefinition,
  GameMechanic,
  GameMode,
  SkillBand,
  UnlockRule,
} from "./types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const MODES: ReadonlySet<string> = new Set([
  "letter", "word", "sentence", "number", "symbol", "mixed",
  "paragraph", "story", "shortcut",
]);

const MECHANICS: ReadonlySet<string> = new Set([
  "target-press", "falling-catch", "sequence-build", "time-trial",
  "accuracy-trial", "survival-waves", "race-checkpoints", "defense-shield",
  "escape-run", "collection", "boss-phased", "duel-rounds", "endless",
  "relay-team",
]);

const DIFFICULTIES: ReadonlySet<string> = new Set([
  "beginner", "intermediate", "expert",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkUnlock(rule: unknown, path: string, out: string[]): void {
  if (!isRecord(rule) || typeof rule.type === "string") {
    if (!isRecord(rule)) {
      out.push(`${path}: rule must be an object`);
      return;
    }
    // Leaf condition.
    switch (rule.type) {
      case "open":
        return;
      case "level":
      case "xp":
      case "accuracy":
      case "wpm":
        if (typeof rule.min !== "number" || !(rule.min >= 0)) {
          out.push(`${path}: ${rule.type}.min must be a number >= 0`);
        }
        return;
      case "missionsCompleted":
        if (typeof rule.count !== "number" || !(rule.count > 0)) {
          out.push(`${path}: missionsCompleted.count must be > 0`);
        }
        return;
      case "gamesCompleted":
        if (
          !Array.isArray(rule.gameSlugs) ||
          rule.gameSlugs.length === 0 ||
          !rule.gameSlugs.every((s): s is string => typeof s === "string")
        ) {
          out.push(`${path}: gamesCompleted.gameSlugs must be a non-empty string array`);
        }
        return;
      case "badge":
        if (typeof rule.badgeSlug !== "string" || rule.badgeSlug === "") {
          out.push(`${path}: badge.badgeSlug must be a non-empty string`);
        }
        return;
      default:
        break;
    }
  }
  // Group node (or unknown leaf).
  if (isRecord(rule) && (rule.op === "and" || rule.op === "or")) {
    if (!Array.isArray(rule.rules) || rule.rules.length === 0) {
      out.push(`${path}: group needs a non-empty rules array`);
      return;
    }
    rule.rules.forEach((r, i) => {
      checkUnlock(r, `${path}.rules[${String(i)}]`, out);
    });
    return;
  }
  out.push(`${path}: unknown unlock rule shape`);
}

export function validateGameDefinition(def: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(def)) return ["definition must be an object"];
  const d: Record<string, unknown> = def;

  if (typeof d.id !== "string" || d.id === "") errors.push("id must be set");
  if (typeof d.slug !== "string" || !SLUG_RE.test(d.slug)) {
    errors.push("slug must match /^[a-z0-9][a-z0-9-]*$/");
  }
  if (!isRecord(d.title) || typeof d.title.en !== "string" || d.title.en === "") {
    errors.push("title.en must be a non-empty string");
  }
  if (
    !isRecord(d.description) ||
    typeof d.description.en !== "string" ||
    d.description.en === ""
  ) {
    errors.push("description.en must be a non-empty string");
  }
  if (typeof d.worldSlug !== "string" || d.worldSlug === "") {
    errors.push("worldSlug must be set");
  }
  if (typeof d.category !== "string" || d.category === "") {
    errors.push("category must be set");
  }
  if (typeof d.mode !== "string" || !MODES.has(d.mode)) {
    errors.push(`mode must be one of ${[...MODES].join(", ")}`);
  }
  if (typeof d.mechanic !== "string" || !MECHANICS.has(d.mechanic)) {
    errors.push(`mechanic must be one of ${[...MECHANICS].join(", ")}`);
  }
  if (typeof d.difficulty !== "string" || !DIFFICULTIES.has(d.difficulty)) {
    errors.push(`difficulty must be one of ${[...DIFFICULTIES].join(", ")}`);
  }
  if (
    !Array.isArray(d.skillBands) ||
    d.skillBands.length === 0 ||
    !d.skillBands.every((s): s is string => typeof s === "string" && DIFFICULTIES.has(s))
  ) {
    errors.push("skillBands must be a non-empty difficulty array");
  }
  if (
    !isRecord(d.promptSource) ||
    typeof d.promptSource.ref !== "string" ||
    d.promptSource.ref === "" ||
    typeof d.promptSource.units !== "number" ||
    !(d.promptSource.units > 0)
  ) {
    errors.push("promptSource needs { ref: string, units: number > 0 }");
  }
  if (
    !isRecord(d.inputRules) ||
    typeof d.inputRules.allowBackspace !== "boolean" ||
    typeof d.inputRules.caseSensitive !== "boolean"
  ) {
    errors.push("inputRules needs { allowBackspace: boolean, caseSensitive: boolean }");
  }
  if (
    !isRecord(d.timingRules) ||
    (d.timingRules.kind !== "untimed" &&
      d.timingRules.kind !== "countdown" &&
      d.timingRules.kind !== "countup")
  ) {
    errors.push("timingRules.kind must be untimed|countdown|countup");
  }
  if (
    d.timingRules !== undefined &&
    isRecord(d.timingRules) &&
    (d.timingRules.kind === "countdown" || d.timingRules.kind === "countup") &&
    d.timingRules.limitSeconds !== undefined &&
    (typeof d.timingRules.limitSeconds !== "number" || !(d.timingRules.limitSeconds > 0))
  ) {
    errors.push("timingRules.limitSeconds must be > 0 when set on timed games");
  }
  if (typeof d.scoringProfile !== "string" || d.scoringProfile === "") {
    errors.push("scoringProfile must be set");
  }
  checkUnlock(d.unlockRule, "unlockRule", errors);
  if (
    !isRecord(d.attemptRules) ||
    (d.attemptRules.maxAttemptsPerDay !== null &&
      (typeof d.attemptRules.maxAttemptsPerDay !== "number" ||
        !(d.attemptRules.maxAttemptsPerDay > 0))) ||
    typeof d.attemptRules.cooldownSeconds !== "number" ||
    !(d.attemptRules.cooldownSeconds >= 0) ||
    typeof d.attemptRules.expiresAfterSeconds !== "number" ||
    !(d.attemptRules.expiresAfterSeconds > 0) ||
    typeof d.attemptRules.allowRetry !== "boolean"
  ) {
    errors.push(
      "attemptRules needs { maxAttemptsPerDay: number|null, cooldownSeconds >= 0, expiresAfterSeconds > 0, allowRetry: boolean }",
    );
  }
  if (
    !isRecord(d.theme) ||
    typeof d.theme.visual !== "string" ||
    typeof d.theme.audio !== "string"
  ) {
    errors.push("theme needs { visual: string, audio: string }");
  }
  if (!isRecord(d.config)) errors.push("config must be an object");
  if (typeof d.competitionEligible !== "boolean") {
    errors.push("competitionEligible must be boolean");
  }
  if (typeof d.isActive !== "boolean") errors.push("isActive must be boolean");
  if (typeof d.version !== "number" || !Number.isInteger(d.version) || !(d.version >= 1)) {
    errors.push("version must be an integer >= 1");
  }
  return errors;
}

export type {
  Difficulty,
  GameDefinition,
  GameMechanic,
  GameMode,
  SkillBand,
  UnlockRule,
};
