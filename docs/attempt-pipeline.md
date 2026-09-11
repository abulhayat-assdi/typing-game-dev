# Attempt Pipeline (M4)

Client plays locally (typing engine) → submits compact evidence once →
server recomputes, validates, atomically finalizes. No per-keystroke traffic,
no keystroke rows in PostgreSQL.

## Lifecycle + endpoints

`POST /api/games/[gameId]/attempts/start` (auth → active game → seeded
prompt via `@tap/content` → `fn_start_attempt`) returns
`{ attemptId, expectedText, difficulty, expiresAt, timing }` (201).

`POST .../[attemptId]/submit` (auth → ownership → server diff via
`diffExpected` → `computeRawMetrics` → `validateSubmission` →
`computeScore` → `fn_submit_attempt`) returns
`{ status: validated|rejected, score, accuracy, effectiveWpm, reason? }`.
Malformed → 400; anonymous → 401; unknown/foreign/mismatched → opaque 404;
double finalize → 409; expired → 410; unconfigured → 503.

`GET .../[attemptId]` returns the summary (+ result once terminal).

## Database (0007)

`game_attempts` (user, game, immutable version ref, prompt seed + expected
snapshot, difficulty, status, expiry, timestamps; indexes on
(user,created), (game,status), (status,expires)) + `attempt_results`
(one-to-one: raw metrics JSON, score, accuracy, WPM, verdict, reason).
API roles have SELECT-own only; the two SECURITY DEFINER functions are the
sole writers (row lock + status gate ⇒ duplicate finalization impossible).
Results are immutable (no UPDATE policy; admin corrections via service_role
+ manual audit row).

## Trust boundaries (intentional)

- Server-verified: correctness, accuracy, WPM, score, ownership, state, expiry.
- Client-provided, consistency-bounded: corrections/errorStrokes counts
  (bounded by typed length; exact per-key truth would require event streams).
- Event-level replay audit is the designed evolution (attempt `metadata`
  carries flags today for the future review queue).

## Known limitations (anti-cheat is foundational, not perfect)

1. Human-vs-bot indistinguishability above the WPM cap is unsolved; caps +
   flags + rate limits contain, not eliminate, automation.
2. Corrections/errorStrokes are self-reported (bounded, not verified).
3. No device/session anomaly scoring yet (Phase 3 anti-abuse builds on the
   `flags` + `metadata` fields added here).
4. Expiry marking relies on a future sweeper; finalization past expiry is
   already impossible (re-checked on every submit).
