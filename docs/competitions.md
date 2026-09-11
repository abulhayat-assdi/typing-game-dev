# Competitions (M8)

Server-authoritative typing contests on top of M2–M7. One identity, one
XP/coin ledger, one attempt engine — competitions add scheduling,
eligibility, recognition and reward plumbing, never parallel economies.

- Model: `supabase/migrations/0013_competitions.sql` (tables, lifecycle
  enum, RLS) + `0014_competition_ops.sql` (create/draft/transition/
  register/attach) + `0014_competition_finalize.sql` (results, rewards,
  adjustments) + `0015_competition_leaderboard.sql` (read projection).
- Domain rules mirror: `packages/competition/src/` (12 unit tests).
- DB suite: `supabase/tests/m8_competition_test.sql`, 45 tests.
- Web: `apps/web/lib/server/competition-store.ts` (sole DB boundary),
  `/api/competitions/*` routes, student hub + staff consoles, 5 docs.

Out of scope (schema-ready, not implemented): `CLAN`, `CLAN_WAR`,
`TOURNAMENT`, `RELAY`, `SEASONAL` types, seasons, rewarded ads, adaptive
learning. See `docs/competition-lifecycle.md` (future clan-war note).

Known baseline (pre-existing, not M8): M7 test 18
`course creation is audited` expects 1 audit row but `seed/dev.sql`
commits 2 course inserts, so it reports have=3. Reproduces with M7 alone;
M8 code must not "fix" it.
