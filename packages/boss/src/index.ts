/** @tap/boss - clan boss domain (M12). No UI imports. */
export {
  DEFAULT_DAMAGE_PROFILE,
  damageFor,
  validateDamageProfile,
} from "./damage";
export {
  applyDamage,
  attemptAllowedInPhase,
  isTerminalStatus,
  phaseForHp,
  validatePhases,
} from "./phases";
export type {
  AttemptMetrics,
  BossInstanceStatus,
  BossPhase,
  DamageFormula,
  DamageProfile,
} from "./types";
