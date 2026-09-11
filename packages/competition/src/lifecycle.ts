/**
 * Competition lifecycle (M8). Explicit transition map — SQL, routes and UI
 * all consult it. Destructive deletion is banned once entries exist
 * (archive/cancel instead); students can never transition anything.
 */
import type { CompetitionStatus } from "./types";

const TERMINAL: ReadonlySet<CompetitionStatus> = new Set([
  "finalized",
  "cancelled",
]);

const TRANSITIONS: Record<CompetitionStatus, ReadonlySet<CompetitionStatus>> = {
  draft: new Set(["scheduled", "cancelled"]),
  scheduled: new Set(["registration_open", "cancelled"]),
  registration_open: new Set(["registration_closed", "live", "cancelled", "paused"]),
  registration_closed: new Set(["registration_open", "live", "cancelled"]),
  live: new Set(["ended", "paused", "cancelled"]),
  paused: new Set(["live", "cancelled"]),
  ended: new Set(["processing", "cancelled"]),
  processing: new Set(["finalized", "ended"]),
  finalized: new Set(),
  cancelled: new Set(),
};

export function isTerminalStatus(status: CompetitionStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionStatus(
  from: CompetitionStatus,
  to: CompetitionStatus,
): boolean {
  return TRANSITIONS[from].has(to);
}

export function allowedNextStatuses(from: CompetitionStatus): CompetitionStatus[] {
  return [...TRANSITIONS[from]];
}

/** Registration accepts entries only in this state. */
export function acceptsRegistration(status: CompetitionStatus): boolean {
  return status === "registration_open";
}

/** Attempts count only while live (server timestamps decide). */
export function acceptsAttempts(status: CompetitionStatus): boolean {
  return status === "live";
}
