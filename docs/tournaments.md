# Tournaments (M14)

A tournament is an **orchestration layer over existing competitive
systems** — never a new scoring engine. It arranges participants into a
bracket, points each match at an existing war/competition context,
collects the result the source engine already validated, and advances
the winner.

```
Tournament → Participants → Seeding → Bracket → Match
  → existing War/Competition scoring → Match result
  → Next round → Final → Champion → Rewards (M5 ledgers)
```

## What tournaments do NOT do

- No typing validation, no scoring, no XP/coin minting of their own.
- No rewarded ads, monetization, adaptive learning, clan shop, advanced
  economy, or new game mechanics (separate milestones).
- No double elimination / round robin / Swiss **implementation** — the
  format enum accepts them and `planBracket()` returns
  `FORMAT_NOT_YET_IMPLEMENTED` so roadmapped formats never emit partial
  brackets.

## Data model (`supabase/migrations/0029_tournaments.sql`)

| Table | Purpose |
|---|---|
| `tournaments` | Definition: slug, name, theme, format, participant_type, status, windows, cap, eligibility/scoring/reward policies, optional `season_id` |
| `tournament_versions` | Immutable definition history (bump on draft edit + finalize snapshot) |
| `tournament_participants` | Frozen-at-seeding roster (`active`/`withdrawn`) |
| `tournament_seeding` | `(tournament_id, seed)` unique — immutable once written |
| `tournament_rounds` | Named rounds (`Final`, `Semifinals`, `Quarterfinals`, `Round of N`) |
| `tournament_matches` | Slots, participants, child refs, source link, scores, winner |
| `tournament_match_participants` | One side per participant per match |
| `tournament_results` | Immutable placements, written once at finalization |
| `tournament_state_events` | Every status hop, with actor |
| `tournament_reward_events` | Idempotency keys for M5 payouts |
| `tournament_adjustments` | Audited bye advances + pre-live substitutions |

## State machines

Tournament: `draft → registration_open → registration_closed → seeded
→ live → processing → finalized`, plus `cancelled` from any
pre-processing state (`processing` may return to `live`).

Match: `pending → ready → live → processing → finalized`, plus
`cancelled`; `bye` is terminal (auto-advanced at seeding).

Both maps live in exactly one place each
(`fn_tournament_can_transition`, `fn_tmatch_can_transition`, mirrored
by `@tap/tournament`'s `canTransition*`). Illegal hops raise explicit
codes (`INVALID_STATE`, `IMMUTABLE`).

## Operations (`0030_tournament_ops.sql`)

- Admin: `fn_create_tournament`, `fn_update_tournament_draft`,
  `fn_publish_tournament`, `fn_close_registration`,
  `fn_cancel_tournament`, `fn_seed_tournament`, `fn_start_tournament`,
  `fn_open_tmatch`, `fn_finalize_tmatch`, `fn_advance_tournament`,
  `fn_finalize_tournament`, `fn_tournament_adjust`.
- Players: `fn_register_tournament`, `fn_withdraw_tournament` (identity
  from `auth.uid()` — forged participant IDs fail the
  existence/eligibility proofs).
- Integrations: `fn_sync_tournament_season` (M13 event model),
  `fn_tournament_sweep` (scheduler hooks, no always-on process).

## Rewards

`fn_finalize_tournament` pays through the M5 ledgers (`xp_ledger`,
`coin_ledger`, `reward_events`) with keys
`tournament:{id}:participant:{pid}:final:v1` (students) and
`tournament:{id}:clan:{clan}:member:{uid}:final:v1` (clan rosters;
clans hold no balances, so members receive per-member honors and the
clan keeps a zero-value honor row). No tournament XP/coins exist.
Re-finalize returns `{already: true}` and pays nothing twice.

## Season integration

A finalized tournament contributes placement points via
`fn_sync_tournament_season(tournament, season)` → `season_point_events`
with `source_type = 'TOURNAMENT'` (the 0027 source-rules check was
widened to admit it). Requires the season's `TOURNAMENT` source rule to
be enabled, the tournament to be finalized inside the season window,
and each recipient to be an eligible frozen season participant. Keys
make reruns insert zero rows.

## API / UI

- Store: `apps/web/lib/server/tournament-store.ts` (Supabase + memory).
- Player: `GET /api/tournaments`, `GET /api/tournaments/[id]`,
  `GET .../board`, `POST .../register|withdraw`.
- Admin: `/api/admin/tournaments` (list/create) and
  `/api/admin/tournaments/[id]/[action]` (`update`, `publish`,
  `close`, `cancel`, `seed`, `start`, `open`, `finalize-match`,
  `advance`, `finalize`, `sync`).
- Pages: `/{locale}/tournaments` + `/[id]` (students),
  `/{locale}/admin/tournaments[/new|/[id]]` (admins).
- Domain logic: `packages/tournament` (pure TS, no UI/DB imports).

See `tournament-seeding.md`, `tournament-brackets.md`,
`tournament-matches.md`, `tournament-security.md`.
