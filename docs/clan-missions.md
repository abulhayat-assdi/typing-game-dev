# Clan missions (M10)

Clan missions reuse M9 mission definitions (`category='CLAN'`) with
clan-scoped runs (`clan_missions`): link (`fn_link_clan_mission`,
admin), start (`fn_start_clan_mission`, clan leader/co-leader or
admin), sync (`fn_sync_clan_mission`, anyone may trigger — it only
recomputes and pays idempotently).

Progress aggregates active members' validated attempts in the run
window with clan semantics: counts/sums over the member set, accuracy
as clan average, WPM as qualifying-member count, plus per-objective
participant counts. Students can never mark completion — only the
aggregate decides. Completion pays each contributor personal XP/coins
through the M5 ledgers under
`clan-mission:{run}:member:{user}:v1` (re-syncs pay nothing extra) and
logs feed/hooks entries. No separate mission engine, no side ledger.

Boards reuse the contribution aggregate (`fn_clan_board`, windows
all/weekly/daily) — the same derived-metric family as
`comp_batch_aggregate`, kept generic for batch/clan/future war
contexts. The roster projection (`fn_clan_roster`) exposes display
name, roll, level, totals, streak, badges and contribution — never
emails, auth data or moderation fields.
