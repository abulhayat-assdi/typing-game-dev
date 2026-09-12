# Weekly challenges (M9)

Week grain is Monday (`date_trunc('week', …)` in the student's
timezone). `fn_assign_weekly` deterministically picks up to 2 active
`WEEKLY` missions per student per week (idempotent rows in
`weekly_challenges`). Progress spans the whole week — the same
objective evaluator runs over a 7-day window — and the UI shows current
progress, percentage via progress bars, reward preview and completion
state.

Examples: complete 15 games, type 5,000 correct characters
(`CHARS_TYPED` sums `correctCharacters` from server-computed result
payloads), maintain qualifying days (streak stays M5-authoritative;
missions only consume validated attempts), games from 3 worlds
(`WORLD_GAMES`/`DISTINCT_GAMES` with world scoping), WPM gates,
personal-best counts (`personal_records` rows in-window). Expiration is
implicit: a new week assigns a new set; old instances keep their final
status as history.
