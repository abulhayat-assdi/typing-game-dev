/**
 * Competition presentation helpers (M8). Pure: no Supabase, no network.
 * Server timestamps stay authoritative — the countdown component only
 * renders the remaining time, never decides eligibility.
 */

export type CompetitionSection =
  | "live"
  | "registration"
  | "upcoming"
  | "completed";

export function statusSection(status: string): CompetitionSection {
  if (status === "live") return "live";
  if (status === "registration_open") return "registration";
  if (
    status === "finalized" ||
    status === "cancelled" ||
    status === "ended" ||
    status === "processing"
  ) {
    return "completed";
  }
  return "upcoming";
}

export type CompetitionStatusKey =
  | "statusDraft"
  | "statusScheduled"
  | "statusRegistrationOpen"
  | "statusRegistrationClosed"
  | "statusLive"
  | "statusEnded"
  | "statusProcessing"
  | "statusFinalized"
  | "statusCancelled";

export function statusKey(status: string): CompetitionStatusKey {
  switch (status) {
    case "draft":
      return "statusDraft";
    case "scheduled":
      return "statusScheduled";
    case "registration_open":
      return "statusRegistrationOpen";
    case "registration_closed":
      return "statusRegistrationClosed";
    case "live":
      return "statusLive";
    case "ended":
      return "statusEnded";
    case "processing":
      return "statusProcessing";
    case "finalized":
      return "statusFinalized";
    case "cancelled":
      return "statusCancelled";
    default:
      return "statusScheduled";
  }
}

/** Remaining ms from a server clock reading to a server timestamp. */
export function msRemaining(serverNowIso: string, targetIso: string): number {
  const diff = Date.parse(targetIso) - Date.parse(serverNowIso);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}

export function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return d > 0
    ? `${String(d)}d ${hh}:${mm}:${ss}`
    : `${hh}:${mm}:${ss}`;
}

export function formatDateTime(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}

/** Short human reward preview, e.g. "Winner 100 XP · Participation 10 XP". */
export function rewardSummary(
  policy: Record<string, unknown>,
  winnerLabel: string,
  participationLabel: string,
): string | null {
  if (typeof policy !== "object") return null;
  const xp = policy.xp;
  if (!xp || typeof xp !== "object") return null;
  const parts: string[] = [];
  const rec = xp as Record<string, unknown>;
  if (typeof rec["1"] === "number") {
    parts.push(`${winnerLabel}: ${String(rec["1"])} XP`);
  }
  if (typeof rec.participation === "number") {
    parts.push(`${participationLabel}: ${String(rec.participation)} XP`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
