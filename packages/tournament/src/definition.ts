/**
 * Tournament definition validation + lifecycle maps (M14). Mirrors the
 * 0029 CHECK constraints and fn_tournament_can_transition /
 * fn_tmatch_can_transition; the database re-validates on write.
 */
import type { TournamentDefinitionInput } from "./types";

const SLUG = /^[a-z0-9-]{1,80}$/;

const FORMATS: ReadonlySet<string> = new Set([
  "single_elimination",
  "double_elimination",
  "round_robin",
  "swiss",
]);

const PARTICIPANT_TYPES: ReadonlySet<string> = new Set(["clan", "student"]);

export function validateTournamentDefinition(
  def: Omit<TournamentDefinitionInput, "format" | "participantType"> & {
    format: string;
    participantType: string;
  },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!SLUG.test(def.slug)) errors.push("MALFORMED_SLUG");
  if (!def.name || def.name.length > 160) errors.push("MALFORMED_NAME");
  if (!FORMATS.has(def.format)) errors.push("UNSUPPORTED_FORMAT");
  if (!PARTICIPANT_TYPES.has(def.participantType)) {
    errors.push("UNSUPPORTED_PARTICIPANT_TYPE");
  }
  if (def.format !== "single_elimination") {
    errors.push("FORMAT_NOT_YET_IMPLEMENTED");
  }
  const regStart =
    def.registrationStart == null ? NaN : Date.parse(def.registrationStart);
  const regEnd =
    def.registrationEnd == null ? NaN : Date.parse(def.registrationEnd);
  if (
    (def.registrationStart != null && !Number.isFinite(regStart)) ||
    (def.registrationEnd != null && !Number.isFinite(regEnd))
  ) {
    errors.push("INVALID_REGISTRATION_WINDOW");
  } else if (
    Number.isFinite(regStart) &&
    Number.isFinite(regEnd) &&
    regEnd <= regStart
  ) {
    errors.push("INVALID_REGISTRATION_WINDOW");
  }
  const start = def.startAt == null ? NaN : Date.parse(def.startAt);
  const end = def.endAt == null ? NaN : Date.parse(def.endAt);
  if (
    (def.startAt != null && !Number.isFinite(start)) ||
    (def.endAt != null && !Number.isFinite(end))
  ) {
    errors.push("INVALID_WINDOW");
  } else if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
    errors.push("INVALID_WINDOW");
  }
  if (
    def.participantCap !== undefined &&
    def.participantCap !== null &&
    (!Number.isInteger(def.participantCap) || def.participantCap < 2)
  ) {
    errors.push("INVALID_PARTICIPANT_CAP");
  }
  return { ok: errors.length === 0, errors };
}

const TOURNAMENT_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(["registration_open", "cancelled"]),
  registration_open: new Set(["registration_closed", "cancelled"]),
  registration_closed: new Set(["seeded", "registration_open", "cancelled"]),
  seeded: new Set(["live", "cancelled"]),
  live: new Set(["processing", "cancelled"]),
  processing: new Set(["finalized", "live"]),
  finalized: new Set(),
  cancelled: new Set(),
};

export function canTransitionTournamentStatus(
  from: string,
  to: string,
): boolean {
  return TOURNAMENT_TRANSITIONS[from]?.has(to) ?? false;
}

const MATCH_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  pending: new Set(["ready", "cancelled"]),
  ready: new Set(["live", "cancelled"]),
  live: new Set(["processing", "cancelled"]),
  processing: new Set(["finalized", "live"]),
  finalized: new Set(),
  bye: new Set(),
  cancelled: new Set(),
};

export function canTransitionMatchStatus(from: string, to: string): boolean {
  return MATCH_TRANSITIONS[from]?.has(to) ?? false;
}

export function isImplementedFormat(format: string): boolean {
  return format === "single_elimination";
}

export function isSupportedParticipantType(
  t: string,
): boolean {
  return t === "clan" || t === "student";
}
