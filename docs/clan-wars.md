# Clan Wars (M11)

Scheduled Clan A vs Clan B competitive contexts on top of M4 attempts,
M5 ledgers, M8 competition patterns and the M10 clan foundation. One
war = two clans, one game pool, one battle window, one immutable
result. No second attempt model, no second scoring engine, no war
economy.

- Model: `0022_clan_wars.sql` (wars, invitations, games, participants,
  attempts, contributions, results, state/reward/adjustment logs, RLS),
  `0023_war_ops.sql` (challenge/respond/cancel, eligibility snapshots,
  scheduler sweep), `0024_war_scoring.sql` (submissions, sync,
  finalize, privacy-safe board).
- Domain: `packages/war/src/` (6 unit tests: lifecycle map, scoring
  modes, deterministic ties).
- DB suite: `supabase/tests/m11_war_test.sql`, 51 tests.
- Web: `lib/server/war-store.ts`, `/api/wars/*`,
  `/api/admin/wars/*`, student war hub + war room, admin oversight.

Out of scope (hooks only): bosses, seasons, brackets, rewarded ads,
automated matchmaking, adaptive learning.
