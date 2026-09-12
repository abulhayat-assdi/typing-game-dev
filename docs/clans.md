# Clans (M10)

Social foundation: every active batch projects one active Clan.
`Organization → Course → Batch → Clan → Clan Members`. The clan row is
explicit (never collapsed into the batch) so wars, seasons and
cross-course play can evolve without rewriting batches.

- Model: `0019_clans.sql` (clans, members, leadership audit,
  contributions, clan missions, activity/events, help requests/
  contributions, sync triggers, RLS), `0020_clan_ops.sql` (roles,
  roster/board, profile), `0021_clan_missions_help.sql` (mission runs,
  bounded help).
- Domain: `packages/clan/src/` (7 unit tests: contribution rules, help
  economics, aggregation).
- DB suite: `supabase/tests/m10_clan_test.sql`, 46 tests.
- Web: `lib/server/clan-store.ts`, `/api/clan/*`,
  `/api/admin/clans/*`, student clan hub + teacher/admin consoles.

Clan XP is always derived (`sum(clan_contributions)` via
`fn_clan_xp`) — no stored mutable counter, no duplicated personal XP.
Out of scope (extension points only): bosses, wars, cross-course wars,
seasons, brackets, shop, advanced economy, rewarded ads.
