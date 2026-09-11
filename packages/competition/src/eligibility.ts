/**
 * Eligibility evaluator (M8). Display-side explanations; the SQL registration
 * function re-enforces every rule authoritatively. Never duplicated elsewhere.
 */
import type { EligibilityRule } from "./types";

export interface EligibilityPlayer {
  batchIds: string[];
  courseIds: string[];
  skillBand: string | null;
  level: number;
  bestAccuracy: number;
  bestWpm: number;
  active: boolean;
  alreadyRegistered: boolean;
  nowIso: string;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
}

export interface EligibilityVerdict {
  eligible: boolean;
  reasons: string[];
}

export function evaluateEligibility(
  rule: EligibilityRule,
  player: EligibilityPlayer,
): EligibilityVerdict {
  const reasons: string[] = [];
  if (!player.active) {
    return { eligible: false, reasons: ["ACCOUNT_INACTIVE"] };
  }
  if (player.alreadyRegistered) {
    return { eligible: false, reasons: ["ALREADY_REGISTERED"] };
  }
  if (
    player.registrationStartsAt &&
    player.nowIso < player.registrationStartsAt
  ) {
    return { eligible: false, reasons: ["REGISTRATION_NOT_OPEN"] };
  }
  if (
    player.registrationEndsAt &&
    player.nowIso > player.registrationEndsAt
  ) {
    return { eligible: false, reasons: ["REGISTRATION_CLOSED"] };
  }
  if (
    rule.batches &&
    rule.batches.length > 0 &&
    !rule.batches.some((b) => player.batchIds.includes(b))
  ) {
    reasons.push("BATCH_INELIGIBLE");
  }
  if (
    rule.courses &&
    rule.courses.length > 0 &&
    !rule.courses.some((c) => player.courseIds.includes(c))
  ) {
    reasons.push("COURSE_INELIGIBLE");
  }
  if (
    rule.skillBands &&
    rule.skillBands.length > 0 &&
    (player.skillBand === null || !rule.skillBands.includes(player.skillBand))
  ) {
    reasons.push("SKILL_INELIGIBLE");
  }
  if (rule.minLevel !== undefined && player.level < rule.minLevel) {
    reasons.push("LEVEL_TOO_LOW");
  }
  if (rule.minAccuracy !== undefined && player.bestAccuracy < rule.minAccuracy) {
    reasons.push("ACCURACY_TOO_LOW");
  }
  if (rule.minWpm !== undefined && player.bestWpm < rule.minWpm) {
    reasons.push("WPM_TOO_LOW");
  }
  return { eligible: reasons.length === 0, reasons };
}
