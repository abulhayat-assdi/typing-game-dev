/**
 * Reusable typing engine (M4). Pure state machine — no React, no DOM, no I/O.
 * Handles letters/words/sentences/numbers/punctuation/capitalization/spaces,
 * backspace corrections, timed and untimed play, and multi-stage sequences
 * (one session per stage; callers chain stages).
 *
 * Performance contract: O(1) amortized per keystroke, zero allocations in the
 * hot path beyond the typed buffer. Never persists — callers submit a compact
 * summary (see snapshot()) only once per attempt.
 */

export interface TypingSessionOptions {
  /** Case-insensitive matching (e.g. early keyboard discovery games). */
  caseSensitive?: boolean;
  /** When false, backspace events are ignored by the session. */
  allowBackspace?: boolean;
}

export type KeyOutcome =
  | { accepted: true; correct: boolean; done: boolean }
  | { accepted: false; reason: "complete" | "empty" | "invalid-key" };

export interface TypingSnapshot {
  expectedLength: number;
  typedLength: number;
  /** Positions currently matching the prompt. */
  correctChars: number;
  /** Positions currently mismatching (uncorrected errors). */
  incorrectChars: number;
  /** All wrong keystrokes ever pressed (including later corrected). */
  errorStrokes: number;
  /** Wrong chars removed via backspace. */
  corrections: number;
  combo: number;
  maxCombo: number;
  done: boolean;
  /** 0..100, capped. */
  completionPct: number;
  /** Frozen at the last event (ms since first input; 0 before input). */
  elapsedMs: number;
  /** Expected words fully covered by correct input. */
  completedWords: number;
  totalWords: number;
}

export interface TypingSession {
  readonly expected: string;
  input(key: string, atMs: number): KeyOutcome;
  backspace(atMs: number): KeyOutcome;
  snapshot(): TypingSnapshot;
}

function wordsOf(text: string): string[] {
  return text.split(" ").filter((w) => w.length > 0);
}

/**
 * Stateless server-side diff (M4): recompute position-wise correctness from
 * the server-known prompt and submitted text. Extra submitted characters
 * beyond the prompt count as incorrect. The server never trusts
 * client-claimed correct/incorrect counts.
 */
export function diffExpected(
  expected: string,
  typed: string,
): { correctChars: number; incorrectChars: number } {
  const exp = Array.from(expected);
  const got = Array.from(typed);
  const n = Math.max(exp.length, got.length);
  let correct = 0;
  for (let i = 0; i < n; i++) {
    if (i < exp.length && i < got.length && got[i] === exp[i]) correct++;
  }
  return { correctChars: correct, incorrectChars: got.length - correct };
}

export function createTypingSession(
  expected: string,
  opts: TypingSessionOptions = {},
): TypingSession {
  const caseSensitive = opts.caseSensitive ?? true;
  const allowBackspace = opts.allowBackspace ?? true;
  const chars = Array.from(expected);
  const typed: string[] = [];
  /** Per-position correctness at press time (stale after backspace — recomputed). */
  let errorStrokes = 0;
  let corrections = 0;
  let combo = 0;
  let maxCombo = 0;
  let startedAtMs: number | null = null;
  let lastAtMs = 0;

  const same = (a: string, b: string): boolean =>
    caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase();

  function touch(atMs: number): void {
    const t = Number.isFinite(atMs) ? atMs : lastAtMs;
    if (startedAtMs === null) {
      startedAtMs = t;
      lastAtMs = t;
    } else {
      // Clamp out-of-order timestamps instead of corrupting timing.
      lastAtMs = Math.max(lastAtMs, t);
    }
  }

  function currentCorrect(): number {
    let n = 0;
    for (let i = 0; i < typed.length; i++) {
      if (same(typed[i] as string, chars[i] as string)) n++;
    }
    return n;
  }

  const session: TypingSession = {
    expected,

    input(key: string, atMs: number): KeyOutcome {
      if (typeof key !== "string" || Array.from(key).length !== 1) {
        return { accepted: false, reason: "invalid-key" };
      }
      if (typed.length >= chars.length) {
        return { accepted: false, reason: "complete" };
      }
      touch(atMs);
      const correct = same(key, chars[typed.length] as string);
      typed.push(key);
      if (correct) {
        combo += 1;
        if (combo > maxCombo) maxCombo = combo;
      } else {
        errorStrokes += 1;
        combo = 0;
      }
      return { accepted: true, correct, done: typed.length >= chars.length };
    },

    backspace(atMs: number): KeyOutcome {
      if (!allowBackspace) return { accepted: false, reason: "invalid-key" };
      if (typed.length === 0) return { accepted: false, reason: "empty" };
      touch(atMs);
      const idx = typed.length - 1;
      const removed = typed.pop() as string;
      if (!same(removed, chars[idx] as string)) corrections += 1;
      combo = 0;
      return { accepted: true, correct: true, done: false };
    },

    snapshot(): TypingSnapshot {
      const correct = currentCorrect();
      const incorrect = typed.length - correct;
      const done = typed.length >= chars.length && chars.length > 0;
      const totalWords = wordsOf(expected).length;
      // Completed words: expected word fully covered by correct input.
      let completedWords = 0;
      let pos = 0;
      for (const w of wordsOf(expected)) {
        const start = expected.indexOf(w, pos);
        const end = start + w.length;
        let ok = typed.length >= end;
        if (ok) {
          for (let i = start; i < end; i++) {
            if (!same(typed[i] as string, chars[i] as string)) {
              ok = false;
              break;
            }
          }
        }
        if (ok) completedWords += 1;
        pos = end;
      }
      return {
        expectedLength: chars.length,
        typedLength: typed.length,
        correctChars: correct,
        incorrectChars: incorrect,
        errorStrokes,
        corrections,
        combo,
        maxCombo,
        done,
        completionPct:
          chars.length === 0
            ? 100
            : Math.min(100, (typed.length / chars.length) * 100),
        elapsedMs: startedAtMs === null ? 0 : Math.max(0, lastAtMs - startedAtMs),
        completedWords,
        totalWords,
      };
    },
  };

  return session;
}
