# Tournament Matches (M14)

A tournament match is a pointer plus an outcome. It never scores
typing itself.

## Match row

`round_id`, `slot`, `participant_a/b`, `child_match_a/b` (feeders),
`status`, optional window, `source_type` (`clan_war`, `competition`,
`bye`, `manual`), `source_id`, `winner_id`/`loser_id` (constrained to
the two participants), `score_a/b`, `metrics`, `tie_break`.

## Lifecycle

`pending → ready → live → processing → finalized`, driven by
`fn_start_tournament` (round 1), `fn_open_tmatch` (activation),
`fn_finalize_tmatch` (result), `fn_advance_tournament` (next rounds).
`fn_tmatch_decide` resolves winners; `bye` matches are terminal.

## Execution sources

- **`clan_war` with `source_id`**: `fn_finalize_tmatch` proves the war
  is `finalized` and derives each side's score from
  `clan_war_results` (explicit scores override). Unfinalized wars
  raise `SOURCE_NOT_FINAL`. This is the initial competition-backed
  path: war attempts → war scoring → match result → advancement.
- **`competition` / `manual`**: an admin attests the score (e.g.
  transcribed from a competition board) via `scoreA/scoreB` plus an
  optional `metrics` object. The engine still resolves the winner —
  callers never submit a winner directly.

## Tie handling (`fn_tmatch_decide`, `decideWinner`)

Order: primary score → accuracy → best performance → participation →
earliest qualifying result → participant-id fallback (total order, so
a winner always exists). The chain honours
`tournament.scoring_policy.tie_breakers` when configured. The frontend
never decides winners.

## Advancement

Finalizing writes `winner_id`/`loser_id`, then fills the parent slot
(`child_match_a` ⇒ side A, `child_match_b` ⇒ side B). Guards:

- winner must be a match participant (`MALFORMED` otherwise);
- replaying an already-advanced winner is a no-op;
- a different occupant, or the winner appearing elsewhere in the
  target round, raises `DUPLICATE` (no double advancement, no
  round duplication);
- finalized/`bye` matches reject re-finalization (`IMMUTABLE`).

## Scheduler

`fn_tournament_sweep()` closes due registrations and starts due
tournaments (round-1 activation included). No always-on process is
assumed; manual triggers (`close`, `start`, `advance`) exist for
recovery and tests.
