import { describe, expect, it } from "vitest";
import { validateSubmission } from "./validation";

const BASE = {
  expectedLength: 100,
  typedLength: 100,
  correctChars: 95,
  corrections: 3,
  elapsedMs: 60000,
};

describe("validateSubmission", () => {
  it("accepts a consistent submission and recomputes metrics", () => {
    const v = validateSubmission({
      ...BASE,
      claimedAccuracy: 95,
      claimedWpm: 19,
    });
    expect(v.ok).toBe(true);
    expect(v.recomputed.accuracy).toBeCloseTo(95, 5);
    expect(v.recomputed.effectiveWpm).toBeCloseTo(19, 5);
    expect(v.flags).toEqual([]);
  });

  it("rejects forged accuracy and WPM claims", () => {
    expect(
      validateSubmission({ ...BASE, claimedAccuracy: 50 }).rejectReason,
    ).toBe("FORGED_ACCURACY");
    expect(validateSubmission({ ...BASE, claimedWpm: 90 }).rejectReason).toBe(
      "FORGED_WPM",
    );
  });

  it("rejects impossible WPM and flags review-range WPM", () => {
    const impossible = validateSubmission({
      expectedLength: 500,
      typedLength: 500,
      correctChars: 500,
      corrections: 0,
      elapsedMs: 10000, // 600 wpm
    });
    expect(impossible.ok).toBe(false);
    expect(impossible.rejectReason).toBe("IMPOSSIBLE_WPM");

    const fast = validateSubmission({
      expectedLength: 900,
      typedLength: 900,
      correctChars: 880,
      corrections: 10,
      elapsedMs: 60000, // 176 wpm
    });
    expect(fast.ok).toBe(true);
    expect(fast.flags).toContain("REVIEW_WPM");
  });

  it("rejects malformed and inconsistent evidence", () => {
    expect(validateSubmission({ ...BASE, elapsedMs: 0 }).rejectReason).toBe(
      "INVALID_EVIDENCE",
    );
    expect(validateSubmission({ ...BASE, typedLength: 500 }).rejectReason).toBe(
      "EXCESS_INPUT",
    );
    expect(
      validateSubmission({ ...BASE, corrections: 200 }).rejectReason,
    ).toBe("INCONSISTENT_COUNTS");
    expect(
      validateSubmission({ ...BASE, correctChars: 200 }).rejectReason,
    ).toBe("INCONSISTENT_COUNTS");
  });

  it("works without client claims (server-only evidence)", () => {
    expect(validateSubmission(BASE).ok).toBe(true);
  });
});
