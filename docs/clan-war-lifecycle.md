# Clan war lifecycle (M11)

`draft → challenge_sent → pending_response → accepted → preparation →
live → processing → finalized`, with `declined` (from pending),
`cancelled` (until live) and `expired` (stale invites, 72h sweep)
exits. The map lives once in `fn_war_can_transition` and is mirrored
by `@tap/war` (`canTransitionStatus`); illegal hops fail in both
layers. Every hop writes `clan_war_state_events` (actor, from/to);
invitations keep their own pending/accepted/declined/expired history.

- Challenge: challenger leader/co-leader only; clans must both be
  active; scope policy checked (`same_course` default, `cross_course` /
  `same_org` same-org, `cross_org` super-admin challenger only); one
  non-terminal war per clan; opponents resolve through the
  leader-only `fn_challengeable_clans` discovery (identity only).
- Accept (defender leadership) stamps preparation/battle windows from
  configured hours; zero-hour prep is legal.
- `preparation → live` freezes the participant set (active members
  meeting min level, with level/clan snapshots) so later batch moves
  cannot rewrite history.
- `live → processing` is time-gated; `processing → finalized` runs the
  scoring pass; `processing → live` exists for operator replays.

Schedulers (no always-on server assumed): production cron/Workers call
`fn_war_sweep()` (expire + advance due wars); admins may trigger
`fn_advance_war` per war. Manual flow is fully supported and
documented here as the contract.
