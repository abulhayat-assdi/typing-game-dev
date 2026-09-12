# Missions (M9)

Daily retention loop: login → daily missions → play → validated attempt →
mission progress → M5 XP/coins → streak → next mission → new unlock.
One identity, one ledger, one streak engine — missions add reasons to
play, never parallel economies.

- Model: `0016_missions.sql` (definitions, objectives, instances,
  progress log, completion/reward events, daily/weekly assignments),
  `0017_mission_ops.sql` (admin CRUD, deterministic assignment, start),
  `0018_mission_sync.sql` (server-derived evaluation + idempotent M5
  rewards, student projection, RLS).
- Domain: `packages/missions/src/` (14 unit tests: definition,
  evaluator, rotation).
- DB suite: `supabase/tests/m9_mission_test.sql`, 49 tests.
- Web: `lib/server/mission-store.ts`, `/api/missions/*`,
  `/api/admin/missions/*`, student hub + dashboard widgets, admin console.

Out of scope (reserved only): `COMPETITION`/`CLAN`/`SEASONAL`
categories, clan help/bosses/wars, seasons, tournament brackets,
rewarded ads, full adaptive learning, advanced anti-cheat.
