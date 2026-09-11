# Economy (M5)

Two ledgers, never mixed: `xp_ledger` (progression) and `coin_ledger`
(virtual currency). Every row carries user, signed amount, source,
source_type, idempotency reference, reason, metadata and `balance_after`;
both tables enforce `UNIQUE(user_id, source, reference_id)` plus
non-negative balances.

## Rules

- No `UPDATE profiles SET xp_total` from application code — cached balances
  change only inside `fn_process_progression` (row lock on profiles first,
  fixed lock order, no deadlocks by construction).
- Amounts come from `reward_profiles` (currently the `default` row:
  completion 10 XP / 2 coins, first-completion +20 XP, personal-best +15 XP /
  +5 coins, accuracy ≥95 +10 XP, speed ≥30 WPM +10 XP). Tune rows, not code;
  `@tap/economy` mirrors the math for tests and the offline test double.
- Coins cannot go negative: spends (future shop) must run the same
  lock-insert-update pattern inside a function; the CHECK is a backstop.
- Coins are virtual, non-transferable, non-cash — no exchange surface exists.

## Integrity coverage (pgTAP)

Duplicate processing, direct ledger inserts (42501), balance overwrites
(0 rows), cross-user reads (0 rows), accumulation math, idempotency-key
format — all asserted against the real schema.
