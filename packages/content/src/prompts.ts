/**
 * Prompt sets + deterministic generators (M4). Content is DATA; sampling uses
 * a seeded PRNG so any attempt is reproducible from (setRef, setVersion,
 * seed, units) — the server stores exactly this tuple and can rebuild the
 * prompt for validation or audit.
 */
import type { GameMode } from "@tap/game-engine";

export type PromptKind = "letters" | "words" | "sentences" | "numbers" | "symbols";

export interface PromptSet {
  ref: string;
  version: number;
  kind: PromptKind;
  language: string;
  items: string[];
}

/** String hash (xmur3) → uint32 seed. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const HOME_ROW = "asdfjkl;".split("");
const TOP_ROW = "qwertyuiop".split("");
const NUMBERS = "0123456789".split("");
const SYMBOLS = [".", ",", ";", ":", "'", '"', "!", "?", "-", "(", ")"];

const BEGINNER_WORDS = [
  "cat", "dog", "sun", "run", "fun", "box", "red", "blue", "tree", "fish",
  "bird", "cake", "book", "pen", "cup", "hat", "map", "star", "moon", "rain",
  "play", "jump", "sing", "dance", "happy", "kind", "fast", "slow", "big",
  "small", "apple", "mango", "river", "garden", "school", "friend", "smile",
  "light", "night", "day", "hand", "finger", "key", "type", "word", "game",
  "learn", "practice", "speed", "brave",
];

const COMMON_WORDS = [
  "the", "quick", "brown", "fox", "jumps", "over", "lazy", "typing", "adventure",
  "world", "mission", "player", "level", "score", "accuracy", "journey", "forest",
  "river", "mountain", "castle", "dragon", "wizard", "pirate", "rocket", "train",
  "market", "garden", "bridge", "harbor", "desert", "ocean", "volcano", "space",
  "keyboard", "finger", "letter", "sentence", "number", "symbol", "shift",
  "practice", "daily", "streak", "badge", "reward", "unlock", "challenge",
  "escape", "sprint", "chase", "rally", "storm", "tunnel", "canyon", "temple",
  "arena", "quest", "trail", "comet", "nebula", "jungle", "oasis", "harbor",
];

const SHORT_SENTENCES = [
  "Type the keys you see.",
  "Keep your fingers on home row.",
  "Speed grows with calm practice.",
  "Every mission teaches a skill.",
  "Accuracy first, speed follows.",
  "The quick fox runs at dawn.",
  "A brave player learns daily.",
  "Small steps cross big rivers.",
  "Find the key and press it.",
  "Words build bridges to worlds.",
  "Practice turns effort into skill.",
  "The garden grows word by word.",
  "Rivers flow to the ocean.",
  "Stars guide the night traveler.",
  "Type steady and win the race.",
  "A kind word opens doors.",
  "Jump over every hurdle fast.",
  "Sing while the keys dance.",
  "Light the lanterns one by one.",
  "The castle gates stand open.",
];

const STANDARD_SENTENCES = [
  "The typing adventure begins in a small village of keys.",
  "Each world unlocks new challenges for steady hands.",
  "Consistency beats short bursts of careless speed.",
  "Maya crossed the desert by typing through every gate.",
  "The dragon only respects flawless word combinations.",
  "Numbers and symbols guard the vault of precision.",
  "Shift your focus when capitals appear on screen.",
  "A marathon runner paces every kilometer with care.",
  "The harbor master loads cargo with accurate words.",
  "Storms test even the bravest sky typists daily.",
  "Behind every badge there are a thousand keystrokes.",
  "The map reveals paths to players who persist.",
  "Silent practice builds louder victories over time.",
  "Commas, periods, and colons shape every sentence.",
  "Rally drivers trust rhythm more than raw power.",
];

export const PROMPT_SETS: Record<string, PromptSet> = {
  "alphabet-lower": { ref: "alphabet-lower", version: 1, kind: "letters", language: "en", items: LETTERS },
  "home-row": { ref: "home-row", version: 1, kind: "letters", language: "en", items: HOME_ROW },
  "top-row": { ref: "top-row", version: 1, kind: "letters", language: "en", items: TOP_ROW },
  numbers: { ref: "numbers", version: 1, kind: "numbers", language: "numeric", items: NUMBERS },
  symbols: { ref: "symbols", version: 1, kind: "symbols", language: "symbolic", items: SYMBOLS },
  "beginner-words": { ref: "beginner-words", version: 1, kind: "words", language: "en", items: BEGINNER_WORDS },
  "common-words": { ref: "common-words", version: 1, kind: "words", language: "en", items: COMMON_WORDS },
  "short-sentences": { ref: "short-sentences", version: 1, kind: "sentences", language: "en", items: SHORT_SENTENCES },
  "standard-sentences": { ref: "standard-sentences", version: 1, kind: "sentences", language: "en", items: STANDARD_SENTENCES },
};

export function getPromptSet(ref: string): PromptSet {
  const set = PROMPT_SETS[ref];
  if (!set) throw new Error(`Unknown prompt set "${ref}"`);
  return set;
}

export interface BuiltPrompt {
  text: string;
  setRef: string;
  setVersion: number;
  seed: string;
  units: number;
}

const JOINER: Record<PromptKind, string> = {
  letters: "",
  words: " ",
  sentences: " ",
  numbers: "",
  symbols: "",
};

/**
 * Draw `units` items from a set with replacement, seeded. Same inputs always
 * yield the same text (attempt reproducibility).
 */
export function buildPrompt(setRef: string, units: number, seed: string): BuiltPrompt {
  const set = getPromptSet(setRef);
  if (!Number.isInteger(units) || units <= 0) {
    throw new Error("units must be a positive integer");
  }
  const rand = mulberry32(
    hashSeed(setRef + ":" + String(setVersionOf(set)) + ":" + seed),
  );
  const picked: string[] = [];
  for (let i = 0; i < units; i++) {
    const idx = Math.floor(rand() * set.items.length);
    picked.push(set.items[idx] as string);
  }
  return {
    text: picked.join(JOINER[set.kind]),
    setRef: set.ref,
    setVersion: set.version,
    seed,
    units,
  };
}

function setVersionOf(set: PromptSet): number {
  return set.version;
}

/** Game modes each prompt kind can serve. */
export function modesForKind(kind: PromptKind): GameMode[] {
  switch (kind) {
    case "letters":
      return ["letter"];
    case "words":
      return ["word"];
    case "sentences":
      return ["sentence"];
    case "numbers":
      return ["number"];
    case "symbols":
      return ["symbol"];
  }
}
