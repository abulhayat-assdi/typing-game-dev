import { describe, expect, it } from "vitest";
import { createTypingSession, diffExpected } from "./typing";

describe("typing engine", () => {
  it("accepts correct characters and tracks combo", () => {
    const s = createTypingSession("abc");
    expect(s.input("a", 0)).toMatchObject({ accepted: true, correct: true });
    expect(s.input("b", 100)).toMatchObject({ accepted: true, correct: true });
    const snap = s.snapshot();
    expect(snap.correctChars).toBe(2);
    expect(snap.incorrectChars).toBe(0);
    expect(snap.combo).toBe(2);
    expect(snap.maxCombo).toBe(2);
    expect(snap.done).toBe(false);
  });

  it("counts incorrect characters and breaks combo", () => {
    const s = createTypingSession("abc");
    s.input("a", 0);
    const r = s.input("X", 50);
    expect(r).toMatchObject({ accepted: true, correct: false });
    const snap = s.snapshot();
    expect(snap.correctChars).toBe(1);
    expect(snap.incorrectChars).toBe(1);
    expect(snap.errorStrokes).toBe(1);
    expect(snap.combo).toBe(0);
    expect(snap.maxCombo).toBe(1);
  });

  it("corrects errors with backspace", () => {
    const s = createTypingSession("ab");
    s.input("a", 0);
    s.input("X", 40);
    s.backspace(80);
    const mid = s.snapshot();
    expect(mid.corrections).toBe(1);
    expect(mid.typedLength).toBe(1);
    s.input("b", 120);
    const snap = s.snapshot();
    expect(snap.correctChars).toBe(2);
    expect(snap.incorrectChars).toBe(0);
    expect(snap.done).toBe(true);
  });

  it("backspace on empty input is a noop; disabled backspace is rejected", () => {
    const s = createTypingSession("ab");
    expect(s.backspace(0)).toMatchObject({ accepted: false, reason: "empty" });
    const locked = createTypingSession("ab", { allowBackspace: false });
    locked.input("a", 0);
    expect(locked.backspace(10)).toMatchObject({
      accepted: false,
      reason: "invalid-key",
    });
    expect(locked.snapshot().typedLength).toBe(1);
  });

  it("handles spaces and counts completed words", () => {
    const s = createTypingSession("hi you");
    for (const [i, ch] of ["h", "i", " ", "y", "o", "u"].entries()) {
      s.input(ch, i * 100);
    }
    const snap = s.snapshot();
    expect(snap.done).toBe(true);
    expect(snap.completedWords).toBe(2);
    expect(snap.totalWords).toBe(2);
  });

  it("reports partial completion", () => {
    const s = createTypingSession("abcdefgh");
    s.input("a", 0);
    s.input("b", 10);
    const snap = s.snapshot();
    expect(snap.done).toBe(false);
    expect(snap.completionPct).toBe(25);
    expect(snap.completedWords).toBe(0);
  });

  it("rejects input after completion", () => {
    const s = createTypingSession("a");
    const first = s.input("a", 0);
    expect(first.accepted && first.done).toBe(true);
    expect(s.input("b", 10)).toMatchObject({
      accepted: false,
      reason: "complete",
    });
    expect(s.snapshot().typedLength).toBe(1);
  });

  it("tracks frozen elapsed time between first and last events", () => {
    const s = createTypingSession("abcd");
    expect(s.snapshot().elapsedMs).toBe(0);
    s.input("a", 1000);
    s.input("b", 1500);
    s.input("c", 1200); // out-of-order timestamps clamp, never corrupt
    expect(s.snapshot().elapsedMs).toBe(500);
  });

  it("handles punctuation and numbers exactly", () => {
    const s = createTypingSession("Hi, 2U!");
    for (const [i, ch] of ["H", "i", ",", " ", "2", "U", "!"].entries()) {
      const r = s.input(ch, i * 50);
      expect(r.accepted, `char ${ch}`).toBe(true);
      expect(r, `char ${ch}`).toMatchObject({ correct: true });
    }
    expect(s.snapshot().done).toBe(true);
  });

  it("respects case sensitivity settings", () => {
    const strict = createTypingSession("Ab");
    expect(strict.input("a", 0)).toMatchObject({ correct: false });
    const lax = createTypingSession("Ab", { caseSensitive: false });
    expect(lax.input("a", 0)).toMatchObject({ correct: true });
    expect(lax.input("B", 10)).toMatchObject({ correct: true });
    expect(lax.snapshot().done).toBe(true);
  });

  it("rejects multi-char and non-string keys", () => {
    const s = createTypingSession("ab");
    expect(s.input("ab", 0)).toMatchObject({
      accepted: false,
      reason: "invalid-key",
    });
    expect(s.input("", 0)).toMatchObject({
      accepted: false,
      reason: "invalid-key",
    });
    expect(s.snapshot().typedLength).toBe(0);
  });
});

describe("getTypedText (submit payload)", () => {
  it("returns the committed text including corrections", () => {
    const s = createTypingSession("abc");
    s.input("a", 0);
    s.input("X", 10);
    s.backspace(20);
    s.input("b", 30);
    expect(s.getTypedText()).toBe("ab");
  });
});

describe("diffExpected (server recompute)", () => {  it("counts position-wise matches", () => {
    expect(diffExpected("abc", "abc")).toEqual({
      correctChars: 3,
      incorrectChars: 0,
    });
    expect(diffExpected("abc", "aXc")).toEqual({
      correctChars: 2,
      incorrectChars: 1,
    });
  });

  it("counts extra submitted characters as incorrect", () => {
    expect(diffExpected("ab", "abXYZ")).toEqual({
      correctChars: 2,
      incorrectChars: 3,
    });
  });

  it("handles empty inputs", () => {
    expect(diffExpected("", "")).toEqual({ correctChars: 0, incorrectChars: 0 });
    expect(diffExpected("ab", "")).toEqual({
      correctChars: 0,
      incorrectChars: 0,
    });
  });
});
