/**
 * @tap/boss - clan boss domain (M12). Pure TypeScript, no UI/DB imports.
 * Mirrors fn_boss_damage_for, phase-band resolution and the instance
 * lifecycle in SQL; the database re-validates everything on write.
 */

export type DamageFormula = "score_x_mult" | "wpm_x_acc";

export interface DamageProfile {
  formula: DamageFormula;
  multiplier: number;
  accuracyFactor?: number;
}

export interface BossPhase {
  position: number;
  name: string;
  hpFrom: number;
  hpTo: number;
  damageMultiplier: number;
  minAccuracy?: number;
  games?: string[];
  worlds?: string[];
}

export type BossInstanceStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "defeated"
  | "expired"
  | "cancelled"
  | "processing"
  | "finalized";

export interface AttemptMetrics {
  score: number;
  effectiveWpm: number;
  accuracy: number;
  gameSlug: string;
  worldId: string;
}
