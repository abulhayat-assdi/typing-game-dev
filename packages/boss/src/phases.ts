/**
 * Phase bands + lifecycle (M12). Bands are (hpTo, hpFrom]; boundaries
 * belong to the next phase. Mirrors the SQL resolution exactly.
 */
import type { AttemptMetrics, BossInstanceStatus, BossPhase } from "./types";

export function phaseForHp(phases: BossPhase[], hp: number): number {
  const ordered = [...phases].sort((a, b) => a.position - b.position);
  let current = ordered[0]?.position ?? 0;
  for (const p of ordered) {
    if (hp <= p.hpFrom) current = p.position;
  }
  return current;
}

export function validatePhases(
  phases: BossPhase[],
  maxHp: number,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const ordered = [...phases].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) errors.push("NO_PHASES");
  const positions = new Set<number>();
  for (const p of ordered) {
    if (positions.has(p.position)) errors.push("DUPLICATE_POSITION");
    positions.add(p.position);
    if (!(p.hpFrom > p.hpTo)) errors.push("INVERTED_BAND");
    if (p.damageMultiplier <= 0) errors.push("INVALID_MULTIPLIER");
  }
  if (ordered.length > 0 && ordered[0]?.hpFrom !== maxHp) {
    errors.push("TOP_BAND_MISMATCH");
  }
  const last = ordered[ordered.length - 1];
  if (last && last.hpTo !== 0) errors.push("BOTTOM_BAND_MUST_REACH_ZERO");
  return { ok: errors.length === 0, errors };
}

export function attemptAllowedInPhase(
  phase: BossPhase | undefined,
  metrics: AttemptMetrics,
): { ok: boolean; reason: string | null } {
  if (!phase) return { ok: true, reason: null };
  if (phase.games && phase.games.length > 0 && !phase.games.includes(metrics.gameSlug)) {
    return { ok: false, reason: "GAME_NOT_ALLOWED" };
  }
  if (phase.worlds && phase.worlds.length > 0 && !phase.worlds.includes(metrics.worldId)) {
    return { ok: false, reason: "GAME_NOT_ALLOWED" };
  }
  if (
    phase.minAccuracy !== undefined &&
    metrics.accuracy < phase.minAccuracy
  ) {
    return { ok: false, reason: "BELOW_PHASE_BAR" };
  }
  return { ok: true, reason: null };
}

const TERMINAL: ReadonlySet<BossInstanceStatus> = new Set([
  "defeated",
  "expired",
  "cancelled",
  "finalized",
]);

export function isTerminalStatus(status: BossInstanceStatus): boolean {
  return TERMINAL.has(status);
}

/** HP application shared by UI previews (authoritative math stays in SQL). */
export function applyDamage(currentHp: number, damage: number): number {
  return Math.max(currentHp - Math.max(Math.floor(damage), 0), 0);
}
