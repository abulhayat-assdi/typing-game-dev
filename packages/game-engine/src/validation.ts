/**
 * Server-side submission validation (M4 foundation). The browser is never
 * trusted: the route recomputes accuracy/WPM from the server-known prompt +
 * submitted evidence, then runs these checks. Anything failing closed
 * rejects; anything suspicious-but-possible flags for the review queue
 * (consumed by moderation tooling in a later milestone).
 *
 * Deliberately independent from @tap/scoring (no dependency): the boundary
 * re-derives the two critical metrics itself so a scoring-package bug cannot
 * launder a forged submission.
 */
export interface SubmissionEvidence {
  expectedLength: number;
  typedLength: number;
  correctChars: number;
  corrections: number;
  elapsedMs: number;
  claimedAccuracy?: number | undefined;
  claimedWpm?: number | undefined;
}

export interface ValidationLimits {
  /** Hard reject above this effective WPM (default 220). */
  maxWpm?: number;
  /** Flag for human review above this effective WPM (default 160). */
  reviewWpm?: number;
  /** Tolerance for client-claimed accuracy (default 0.5 points). */
  accuracyTolerance?: number;
  /** Tolerance for client-claimed WPM (default 1.0). */
  wpmTolerance?: number;
}

export interface ValidationVerdict {
  ok: boolean;
  rejectReason?: string;
  flags: string[];
  recomputed: { accuracy: number; effectiveWpm: number };
}

const DEFAULTS = {
  maxWpm: 220,
  reviewWpm: 160,
  accuracyTolerance: 0.5,
  wpmTolerance: 1.0,
} as const;

export function validateSubmission(
  ev: SubmissionEvidence,
  limits: ValidationLimits = {},
): ValidationVerdict {
  const flags: string[] = [];
  const fail = (reason: string): ValidationVerdict => ({
    ok: false,
    rejectReason: reason,
    flags,
    recomputed: { accuracy: 0, effectiveWpm: 0 },
  });

  if (
    !Number.isFinite(ev.elapsedMs) ||
    ev.elapsedMs <= 0 ||
    !Number.isInteger(ev.typedLength) ||
    ev.typedLength <= 0 ||
    !Number.isInteger(ev.expectedLength) ||
    ev.expectedLength <= 0
  ) {
    return fail("INVALID_EVIDENCE");
  }
  if (ev.typedLength > ev.expectedLength * 2 + 100) {
    return fail("EXCESS_INPUT");
  }
  if (ev.corrections > ev.typedLength || ev.correctChars > ev.typedLength) {
    return fail("INCONSISTENT_COUNTS");
  }

  const accuracy = (ev.correctChars / ev.typedLength) * 100;
  const minutes = ev.elapsedMs / 60000;
  const effectiveWpm = ev.correctChars / 5 / minutes;
  const recomputed = { accuracy, effectiveWpm };

  const maxWpm = limits.maxWpm ?? DEFAULTS.maxWpm;
  const reviewWpm = limits.reviewWpm ?? DEFAULTS.reviewWpm;
  if (effectiveWpm > maxWpm) return { ...fail("IMPOSSIBLE_WPM"), recomputed };
  if (effectiveWpm > reviewWpm) flags.push("REVIEW_WPM");

  const accTol = limits.accuracyTolerance ?? DEFAULTS.accuracyTolerance;
  if (
    ev.claimedAccuracy !== undefined &&
    Math.abs(ev.claimedAccuracy - accuracy) > accTol
  ) {
    return { ...fail("FORGED_ACCURACY"), recomputed };
  }
  const wpmTol = limits.wpmTolerance ?? DEFAULTS.wpmTolerance;
  if (
    ev.claimedWpm !== undefined &&
    Math.abs(ev.claimedWpm - effectiveWpm) > wpmTol
  ) {
    return { ...fail("FORGED_WPM"), recomputed };
  }

  return { ok: true, flags, recomputed };
}
