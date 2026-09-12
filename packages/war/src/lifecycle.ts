/**
 * Strict war state machine (M11). Mirrors fn_war_can_transition exactly —
 * illegal transitions fail in both layers.
 */
import type { WarStatus } from "./types";

const TERMINAL: ReadonlySet<WarStatus> = new Set([
  "finalized",
  "cancelled",
  "declined",
  "expired",
]);

const TRANSITIONS: Record<WarStatus, ReadonlySet<WarStatus>> = {
  draft: new Set(["challenge_sent", "cancelled"]),
  challenge_sent: new Set(["pending_response", "cancelled", "expired"]),
  pending_response: new Set(["accepted", "declined", "expired", "cancelled"]),
  accepted: new Set(["preparation", "cancelled"]),
  declined: new Set(),
  preparation: new Set(["live", "cancelled"]),
  live: new Set(["processing", "cancelled"]),
  processing: new Set(["finalized", "live"]),
  finalized: new Set(),
  cancelled: new Set(),
  expired: new Set(),
};

export function isTerminalStatus(status: WarStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionStatus(from: WarStatus, to: WarStatus): boolean {
  return TRANSITIONS[from].has(to);
}

export function allowedNextStatuses(from: WarStatus): WarStatus[] {
  return [...TRANSITIONS[from]];
}

export function acceptsSubmissions(status: WarStatus): boolean {
  return status === "live";
}
