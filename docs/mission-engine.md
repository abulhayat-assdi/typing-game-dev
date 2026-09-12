# Mission engine (M9)

Definitions (`missions`) are reusable: slug, title, category, difficulty,
skill band, objective type + target, game constraints, window,
prerequisites, reward profile, visibility, version. Every draft edit
bumps `version` and appends an immutable `mission_versions` snapshot;
active missions reject edits (`NOT_DRAFT`). Multi-step missions compose
`mission_objectives` rows (position, kind, target); missions without
explicit objectives fall back to the legacy single condition.

Instances (`mission_instances`) separate global definition from student
state: `locked → available → active → completed`, plus `expired` and
`cancelled`. Completed rows are immutable — sync early-returns and never
rewrites them. `mission_progress` logs each contributing validated
attempt (`UNIQUE(instance_id, attempt_id)` = audit + dedupe).

Evaluation (`fn_eval_objective`,mirrored by
`evaluateMissionProgress` in `@tap/missions`): count/sum/max over
validated attempts in the period window, scoped by game/world slugs:
`GAMES_COMPLETED, ACCURACY_REACHED, WPM_REACHED, SCORE_REACHED (max|sum),
CHARS_TYPED, WORDS_TYPED, PERFECT_RUN, DISTINCT_GAMES, PERSONAL_BEST,
WORLD_GAMES`. Rejected/unsubmitted attempts contribute nothing.
`COMBO_TARGET` has no server signal yet and stays incomplete by design
(extension point, never a false pass).

Rewards: completion writes `mission:{instance}:completion:v1` into
`reward_events` (the M5 anchor, `ON CONFLICT DO NOTHING`) and only then
touches `xp_ledger`/`coin_ledger` + `mission_reward_events`. Duplicate
syncs pay nothing extra. Streaks are untouched — M5's validated-attempt
streak remains the only one.
