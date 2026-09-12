/**
 * Bounded help economics (M10). Coin cost from the supporter (a sink),
 * capped system XP to the requester (a bounded faucet). No direct XP
 * transfer is ever possible, so the economy cannot be drained by
 * wash-trading help. Mirrors fn_create_help_request/fn_contribute_help.
 */
import type { HelpLimits } from "./types";

export const DEFAULT_HELP_LIMITS: HelpLimits = {
  requestMax: 50,
  ttlHoursDefault: 48,
  ttlHoursMin: 1,
  ttlHoursMax: 72,
  supporterDailySpend: 100,
  requesterDailyCap: 50,
};

export interface HelpRequestInput {
  requested: number;
  ttlHours?: number;
}

export function validateHelpRequest(
  input: HelpRequestInput,
  limits: HelpLimits = DEFAULT_HELP_LIMITS,
): { ok: boolean; errors: string[]; ttlHours: number } {
  const errors: string[] = [];
  if (
    !Number.isInteger(input.requested) ||
    input.requested <= 0 ||
    input.requested > limits.requestMax
  ) {
    errors.push("MALFORMED");
  }
  const ttl = Math.max(
    limits.ttlHoursMin,
    Math.min(input.ttlHours ?? limits.ttlHoursDefault, limits.ttlHoursMax),
  );
  return { ok: errors.length === 0, errors, ttlHours: ttl };
}

export interface ContributionCheck {
  request: {
    status: string;
    expiresAtMs: number;
    requested: number;
    fulfilled: number;
  };
  isRequester: boolean;
  isMember: boolean;
  alreadyContributed: boolean;
  supporterSpentToday: number;
  requesterReceivedToday: number;
  supporterBalance: number;
  amount: number;
  nowMs: number;
}

/** Pure gate for a help contribution; the database re-checks all of it. */
export function checkContribution(
  c: ContributionCheck,
  limits: HelpLimits = DEFAULT_HELP_LIMITS,
): { ok: boolean; code: string; granted: number } {
  const fail = (code: string): { ok: boolean; code: string; granted: number } => ({
    ok: false,
    code,
    granted: 0,
  });
  if (c.request.status !== "open" && c.request.status !== "partially_fulfilled") {
    return fail("CLOSED");
  }
  if (c.request.expiresAtMs <= c.nowMs) return fail("CLOSED");
  if (c.isRequester) return fail("SELF_FULFILL");
  if (!c.isMember) return fail("CROSS_CLAN");
  if (!Number.isInteger(c.amount) || c.amount <= 0) return fail("MALFORMED");
  if (c.alreadyContributed) return fail("DUPLICATE");
  const granted = Math.min(
    c.amount,
    c.request.requested - c.request.fulfilled,
  );
  if (granted <= 0) return fail("CLOSED");
  if (c.supporterSpentToday + granted > limits.supporterDailySpend) {
    return fail("SUPPORTER_LIMIT");
  }
  if (c.requesterReceivedToday + granted > limits.requesterDailyCap) {
    return fail("REQUESTER_LIMIT");
  }
  if (c.supporterBalance < granted) return fail("INSUFFICIENT_COINS");
  return { ok: true, code: "OK", granted };
}
