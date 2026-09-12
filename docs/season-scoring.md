# Season scoring (M13)

Points derive from finalized source outcomes only, pulled by
`fn_sync_season` (rerunnable; duplicates collapse on event keys
`season:{season}:source:{type}:{source}:participant:{id}:v1`):

- COMPETITION: placement points (1st/2nd/3rd/participation, all
  configurable) to scorers, plus the summed placements to each
  scorer's clan as one event per competition per clan.
- CLAN_WAR: winner/loser clan points from sealed war results.
- CLAN_BOSS: defeat/participation clan points from sealed runs, plus
  flat participation to attempt-making members.
- MISSION: flat points per completion (default off; daily caps
  enforced when enabled).

Per-season source toggles live in `season_source_rules`; gates and
numbers both read that table, so disabling a source stops accrual
while history stays intact. Out-of-window sources never count.
`fn_record_season_points` proves every call against the source tables
(finalized status, real participation, policy-exact amount), so open
entry is safe: forged, inflated or duplicate points are rejected.

Boards (`fn_season_leaderboard`, separate student/clan contexts) rank
by points → earliest event → participant id, with tiers resolved from
`season_tier_definitions` (min points, optional min rank).
