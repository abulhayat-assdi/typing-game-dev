# Progression (M5)

Validated attempts in, persistent progression out — everything server-side.
The browser never decides XP, coins, levels, badges, achievements, streaks,
unlocks or records.

## Pipeline (`fn_process_progression`, one transaction)

```
VALIDATED attempt
  → idempotency anchor (reward_events `attempt:{id}:progression:v1`)
  → XP + coin ledger rows (append-only, UNIQUE(user,source,reference))
  → cached balances + level on profiles (function-only writes)
  → streak day in the student's timezone
  → badge awards (one-time, UNIQUE(user,badge))
  → achievement awards (UNIQUE(user,achievement))
  → personal records (strictly-better-wins upserts)
  → unlock cache for satisfiable rules
  → jsonb summary ({xp, coins, level, new_badges, …})
```

Partial grants are impossible: the whole pipeline commits or rolls back, and
reprocessing returns `{already_processed:true}` with zero new rows.

## Triggering

The submit route calls the store's `processProgression()` after a validated
finalize and returns the summary inline. If it throws, the route answers 500
(the attempt stays validated; an operator replays with
`SELECT fn_process_progression(id)` — safe by idempotency). Rejected,
expired, abandoned or live attempts never reach the pipeline
(`NOT_VALIDATED`).

## Trust split

Server-verified (recomputed): correctness, accuracy, WPM, score, ownership,
state, expiry. Consistency-bounded client evidence: corrections/errorStrokes
(bounded by typed length; event streams are the designed evolution).
Corrections/combo-depth records (e.g. longest combo) are therefore deferred
until evidence carries events — documented, not silently approximated.
