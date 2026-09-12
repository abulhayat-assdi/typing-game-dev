# Seasons (M13)

Time-bounded competitive progression over finalized M8/M9/M10/M11/M12
outcomes. Seasons never modify source systems and never rewrite
lifetime history — they append point events and seal immutable result
snapshots. Season points are a ranking metric, not a balance; final
rewards flow through M5 ledgers.

- Model: `0027_seasons.sql` (seasons, versions, frozen participants,
  source rules, append-only point events, tiers, results, snapshots,
  reward/state/adjustment logs, RLS), `0028_season_ops.sql`
  (admin CRUD, lifecycle, freeze, pull-model sync, boards, finalize,
  sweep).
- Domain: `packages/season/src/` (7 unit tests: definition, scoring,
  tiers, ranking).
- DB suite: `supabase/tests/m13_season_test.sql`, 47 tests.
- Web: `lib/server/season-store.ts`, `/api/seasons/*`,
  `/api/admin/seasons/*`, hub + leaderboards + rewards + history,
  clan season card, admin console.

Out of scope (hooks only): brackets, rewarded ads, adaptive learning,
advanced economy, shop, new game mechanics.
