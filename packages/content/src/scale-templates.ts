/**
 * Mechanic templates (M19, Track B.3). One template per GameMechanic:
 * clone + fill content = new game. Defaults mirror the shipped catalog
 * (RETRY_OPEN / RETRY_TIMED shapes from games.ts). 9 mechanics render
 * today; 5 need a one-time M20 renderer each (status + contract below).
 */
import type { GameMode } from "@tap/game-engine";
import type { MechanicTemplate } from "./scale-schema";

const OPEN_RETRY = {
  maxAttemptsPerDay: null,
  cooldownSeconds: 0,
  expiresAfterSeconds: 900,
  allowRetry: true,
} as const;

const TIMED_RETRY = {
  maxAttemptsPerDay: 20,
  cooldownSeconds: 30,
  expiresAfterSeconds: 600,
  allowRetry: true,
} as const;

const CALM_INPUT = { allowBackspace: false, caseSensitive: false } as const;
const STRICT_INPUT = { allowBackspace: true, caseSensitive: true } as const;
const LENIENT_INPUT = { allowBackspace: true, caseSensitive: false } as const;

interface TemplateSeed {
  mechanic: MechanicTemplate["mechanic"];
  title: string;
  designIntent: string;
  supportedModes: GameMode[];
  defaultTimingKind: "untimed" | "countdown" | "countup";
  defaultLimitSeconds?: number;
  input: typeof CALM_INPUT | typeof STRICT_INPUT | typeof LENIENT_INPUT;
  attempt: typeof OPEN_RETRY | typeof TIMED_RETRY;
  defaultScoring: string;
  requiredConfig: string[];
  suggestedSkills: MechanicTemplate["suggestedSkills"];
  renderer: MechanicTemplate["renderer"];
}

const SEEDS: TemplateSeed[] = [
  {
    mechanic: "target-press", title: "Target Press",
    designIntent: "Press the single shown key or word before it fades. Key recognition and reaction under minimal load.",
    supportedModes: ["letter", "word", "symbol"],
    defaultTimingKind: "untimed", input: CALM_INPUT, attempt: OPEN_RETRY,
    defaultScoring: "standard", requiredConfig: ["targetsPerRound"],
    suggestedSkills: ["key-recognition", "letter-accuracy", "word-reaction"],
    renderer: { status: "shipped", contract: "shows one target, advances on correct press" },
  },
  {
    mechanic: "falling-catch", title: "Falling Catch",
    designIntent: "Type falling tokens before they land. Sustained letter/word reaction with a fail floor.",
    supportedModes: ["letter", "word", "number", "symbol"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 60,
    input: CALM_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "standard", requiredConfig: ["fallSpeed", "lanes"],
    suggestedSkills: ["letter-accuracy", "word-reaction", "numbers", "symbols"],
    renderer: { status: "shipped", contract: "tokens fall at fallSpeed across lanes; miss line ends run" },
  },
  {
    mechanic: "sequence-build", title: "Sequence Build",
    designIntent: "Reproduce growing sequences exactly. Finger placement and word construction through repetition.",
    supportedModes: ["letter", "word", "sentence", "number"],
    defaultTimingKind: "untimed", input: LENIENT_INPUT, attempt: OPEN_RETRY,
    defaultScoring: "standard", requiredConfig: ["sequenceLength"],
    suggestedSkills: ["finger-placement", "word-construction", "sentence-typing"],
    renderer: { status: "shipped", contract: "prompts sequenceLength units; backspace allowed per inputRules" },
  },
  {
    mechanic: "time-trial", title: "Time Trial",
    designIntent: "Maximum correct throughput inside a countdown. The classic speed benchmark.",
    supportedModes: ["word", "sentence", "mixed", "paragraph"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 60,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "speed", requiredConfig: ["durationSec"],
    suggestedSkills: ["speed", "mixed-input", "competitive-preparation"],
    renderer: { status: "shipped", contract: "countdown clock; live WPM readout; hard stop at zero" },
  },
  {
    mechanic: "accuracy-trial", title: "Accuracy Trial",
    designIntent: "Flawless-or-fail precision runs where any error budget breach ends the attempt.",
    supportedModes: ["letter", "word", "sentence", "symbol", "mixed"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 60,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "accuracy", requiredConfig: ["maxErrors"],
    suggestedSkills: ["accuracy", "letter-accuracy", "punctuation", "symbols"],
    renderer: { status: "shipped", contract: "error budget meter; breach rejects the run client-side, server re-checks" },
  },
  {
    mechanic: "survival-waves", title: "Survival Waves",
    designIntent: "Escalating waves with shrinking error tolerance. Endurance under pressure.",
    supportedModes: ["word", "mixed", "sentence"],
    defaultTimingKind: "countup", input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "survival", requiredConfig: ["waves", "waveGrowth"],
    suggestedSkills: ["survival", "endless-endurance", "accuracy"],
    renderer: { status: "shipped", contract: "wave banner; difficulty scales by waveGrowth; elimination on miss quota" },
  },
  {
    mechanic: "race-checkpoints", title: "Race Checkpoints",
    designIntent: "Gate-to-gate racing where each checkpoint banks progress. Competitive preparation.",
    supportedModes: ["word", "sentence", "mixed"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 90,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "speed", requiredConfig: ["checkpoints"],
    suggestedSkills: ["race", "speed", "competitive-preparation"],
    renderer: { status: "shipped", contract: "checkpoint progress bar; missed gate costs time, never soft-locks" },
  },
  {
    mechanic: "escape-run", title: "Escape Run",
    designIntent: "Outrun a pursuer by sustaining pace; stalling lets it catch you. Escape fantasy, typing fuel.",
    supportedModes: ["letter", "word", "sentence", "mixed"],
    defaultTimingKind: "countup", input: LENIENT_INPUT, attempt: OPEN_RETRY,
    defaultScoring: "standard", requiredConfig: ["pursuerSpeed"],
    suggestedSkills: ["escape", "speed", "sentence-typing"],
    renderer: { status: "shipped", contract: "gap meter driven by rolling WPM vs pursuerSpeed" },
  },
  {
    mechanic: "collection", title: "Collection",
    designIntent: "Hunt and collect scattered targets across the board. Exploration-flavored accuracy.",
    supportedModes: ["letter", "word", "number"],
    defaultTimingKind: "untimed", input: CALM_INPUT, attempt: OPEN_RETRY,
    defaultScoring: "standard", requiredConfig: ["targetsPerRound"],
    suggestedSkills: ["collection", "key-recognition", "numbers"],
    renderer: { status: "shipped", contract: "scattered targets; each correct press collects one" },
  },
  {
    mechanic: "defense-shield", title: "Defense Shield",
    designIntent: "Hold the walls: each correct word reinforces the shield, errors breach it. Castle-siege fantasy.",
    supportedModes: ["letter", "word", "sentence", "mixed"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 120,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "survival", requiredConfig: ["shieldHp", "breachPerError", "waves"],
    suggestedSkills: ["defense", "accuracy", "survival"],
    renderer: { status: "m20", contract: "M20 renderer: shield HP bar; correct word +repair, error -breachPerError; 0 HP ends run" },
  },
  {
    mechanic: "boss-phased", title: "Boss Phased",
    designIntent: "Multi-phase boss fight: phases change prompt kind and pace. Direct preparation for clan bosses.",
    supportedModes: ["mixed", "word", "sentence"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 180,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "boss", requiredConfig: ["phases", "phaseSwitchAt"],
    suggestedSkills: ["boss-preparation", "mixed-input", "endless-endurance"],
    renderer: { status: "m20", contract: "M20 renderer: phase banner + boss HP; prompt kind switches at phaseSwitchAt progress marks" },
  },
  {
    mechanic: "duel-rounds", title: "Duel Rounds",
    designIntent: "Head-to-head rounds against a ghost or rival score. Tournament onboarding without stakes.",
    supportedModes: ["word", "sentence", "mixed"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 60,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "speed", requiredConfig: ["rounds", "roundSeconds"],
    suggestedSkills: ["competitive-preparation", "race", "speed"],
    renderer: { status: "m20", contract: "M20 renderer: best-of rounds scoreboard; ghost pace line from difficulty band" },
  },
  {
    mechanic: "endless", title: "Endless",
    designIntent: "No finish line: type until the first elimination condition. Marathon endurance benchmark.",
    supportedModes: ["word", "sentence", "mixed", "paragraph", "story"],
    defaultTimingKind: "countup", input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "survival", requiredConfig: ["eliminationErrors", "rampEverySec"],
    suggestedSkills: ["endless-endurance", "survival", "mixed-input"],
    renderer: { status: "m20", contract: "M20 renderer: distance counter; pace ramps every rampEverySec; eliminationErrors ends run" },
  },
  {
    mechanic: "relay-team", title: "Relay Team",
    designIntent: "Clan relay legs: your best segment contributes to a team total. Async clan-event friendly.",
    supportedModes: ["word", "sentence", "mixed"],
    defaultTimingKind: "countdown", defaultLimitSeconds: 120,
    input: STRICT_INPUT, attempt: TIMED_RETRY,
    defaultScoring: "clan-aggregate", requiredConfig: ["legs", "legSeconds"],
    suggestedSkills: ["collection", "competitive-preparation", "boss-preparation"],
    renderer: { status: "m20", contract: "M20 renderer: leg tracker; segment score staged for clan aggregation, never written client-side" },
  },
];

function toTemplate(seed: TemplateSeed): MechanicTemplate {
  const timing =
    seed.defaultTimingKind === "untimed"
      ? { kind: "untimed" as const }
      : seed.defaultLimitSeconds === undefined
        ? { kind: seed.defaultTimingKind }
        : { kind: seed.defaultTimingKind, limitSeconds: seed.defaultLimitSeconds };
  return {
    mechanic: seed.mechanic,
    title: seed.title,
    designIntent: seed.designIntent,
    supportedModes: seed.supportedModes,
    defaultTiming: timing,
    defaultInput: { ...seed.input },
    defaultAttempt: { ...seed.attempt },
    defaultScoring: seed.defaultScoring,
    requiredConfig: seed.requiredConfig,
    suggestedSkills: seed.suggestedSkills,
    renderer: seed.renderer,
  };
}

/** All 14 mechanic templates, keyed by mechanic. */
export const MECHANIC_TEMPLATES: Record<string, MechanicTemplate> =
  Object.fromEntries(SEEDS.map((s) => [s.mechanic, toTemplate(s)]));

export function getMechanicTemplate(mechanic: string): MechanicTemplate {
  const template = MECHANIC_TEMPLATES[mechanic];
  if (!template) throw new Error(`Unknown mechanic template "${mechanic}"`);
  return template;
}
