# Season lifecycle (M13)

`draft → scheduled → active → processing → finalized`, with
`cancelled` exits from draft/scheduled. One transition map, mirrored
by `@tap/season` (`canTransitionSeasonStatus`); every hop writes
`season_state_events`. Draft edits bump versions with immutable
snapshots; scheduled rows reject edits.

- Activation freezes participants (eligible students by level/course
  scope, all active clans) with display-name snapshots; late joiners
  use `fn_join_season` (idempotent); later batch moves never rewrite
  frozen rows.
- Overlap policy defaults to `GLOBAL_SINGLE` (a second activation
  fails); `MULTIPLE_SCOPES` opts into parallel seasons.
- `fn_season_sweep()` is the production scheduler contract (activate
  due, settle overdue); `fn_advance_season` is the manual per-season
  trigger for recovery and testing. No always-on server assumed.
- Finalize: re-freeze, re-sync, rank, tier, snapshot both boards,
  pay student rewards (1st/2nd/3rd/participation XP/coins), record
  clan honors (no clan balances exist — honors only), seal results.
  Re-finalize returns `already:true` with zero new rows.
