# Clan membership (M10)

Membership is synchronized, never separately enrolled. Database
triggers (no frontend reliance) keep `clan_members` mirroring
`batch_members`:

- batch created → `fn_clan_for_batch` initializes the clan
  (name/slug derived, org inherited; backfilled for older batches).
- student joins batch → active clan membership (other active clan
  memberships close first: one active batch-clan per student,
  `clan_members_one_active_uniq`).
- leave/move/deactivation → old membership `inactive` (+ feed entry);
  rejoin/reactivation restores it where the batch row is still active.
- batch deactivation parks the clan (`inactive`); suspension follows
  the account out and back.

Roles: `leader`, `co_leader`, `member`. The initial leader is assigned
by an admin (`fn_assign_clan_role`); a single leader is enforced
(transfer demotes the predecessor); every change writes
`clan_leadership_audit` plus feed/hooks entries. There is no
self-promotion path — role fns require `fn_can_manage_clan`
(mission admin, super admin, or the clan's org admin), and students
have no write policies at all.

Contribution: each validated attempt mints at most one
`clan_contributions` row (`UNIQUE(attempt_id)`, trigger on
`attempt_results`). Points follow `clans.contribution_rule`
(`points_per_score`, default 10, floor 1) — configurable per clan, so
1 personal XP need never equal 1 clan point.
