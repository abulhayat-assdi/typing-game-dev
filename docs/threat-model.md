# Threat Model (M1 summary)

Never trust the browser for scores or rewards. Server recomputes WPM/accuracy/
score, checks unlocks/attempt windows, enforces idempotency, then writes via
atomic Postgres functions.

Attack surface → control:
- Score/XP/coin injection → no direct ledger writes; SECURITY DEFINER fns
- Replay / duplicate submit → `idempotency_key` unique + attempt windows
- Impossible WPM (e.g. >220) → reject; 160–220 → review queue (M5)
- Unlimited retries → `attemptRules` per game + cooldowns
- Leaderboard manipulation → batch-scoped + snapshots + server settle
- Cross-batch snooping → RLS deny-by-default + whitelist views
- Secret leakage → service-role/R2 secrets server-only, never NEXT_PUBLIC
- Forced/accidental ads → rewarded flow is opt-in, verified, ledger-logged (M8)

Full audit + pgTAP RLS tests land M2/M5; security audit milestone M10.
