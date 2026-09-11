/**
 * Attempt lifecycle (M4). The state machine is the single authority on legal
 * transitions — the API, DB function and clients all consult it.
 *
 * CREATED → STARTED → IN_PROGRESS → SUBMITTED → VALIDATING → VALIDATED
 *                                          ↘ REJECTED (from SUBMITTED/VALIDATING)
 * ABANDONED / EXPIRED can interrupt any non-terminal state.
 */
export type AttemptStatus =
  | "created"
  | "started"
  | "in_progress"
  | "submitted"
  | "validating"
  | "validated"
  | "rejected"
  | "abandoned"
  | "expired";

const TERMINAL: ReadonlySet<AttemptStatus> = new Set([
  "validated",
  "rejected",
  "abandoned",
  "expired",
]);

const TRANSITIONS: Record<AttemptStatus, ReadonlySet<AttemptStatus>> = {
  created: new Set(["started", "abandoned", "expired"]),
  started: new Set(["in_progress", "submitted", "abandoned", "expired"]),
  in_progress: new Set(["submitted", "abandoned", "expired"]),
  submitted: new Set(["validating", "rejected"]),
  validating: new Set(["validated", "rejected"]),
  validated: new Set(),
  rejected: new Set(),
  abandoned: new Set(),
  expired: new Set(),
};

export function isTerminal(status: AttemptStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(from: AttemptStatus, to: AttemptStatus): boolean {
  return TRANSITIONS[from].has(to);
}

export function allowedNext(from: AttemptStatus): AttemptStatus[] {
  return [...TRANSITIONS[from]];
}
