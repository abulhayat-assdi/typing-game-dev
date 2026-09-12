# Clan Bosses (M12)

Cooperative PvE raids: the clan hits one shared HP pool with validated
M4 attempts; phases, defeat and rewards are server-authoritative. No
second attempt engine, no boss currency, no clan-XP mutation.

- Model: `0025_bosses.sql` (definitions, versions, phases, instances,
  participants, pool, attempts, damage/phase events, results, reward
  events, RLS), `0026_boss_ops.sql` (admin CRUD, lifecycle, atomic
  damage, finalize, sweep, privacy-safe state).
- Domain: `packages/boss/src/` (6 unit tests: damage formulas, bands,
  gates, lifecycle helpers).
- DB suite: `supabase/tests/m12_boss_test.sql`, 44 tests.
- Web: `lib/server/boss-store.ts`, `/api/bosses/*`,
  `/api/admin/bosses/*`, lobby + fight screen, admin console.
- Seed: Stone Titan, Word Kraken, Sentence Dragon, Speed Phantom,
  Error King — pure data through the reusable engine.

Out of scope (hooks only): seasons, brackets, rewarded ads, adaptive
learning, matchmaking, shop.
