# Tournament Seeding (M14)

Seeding maps the frozen roster to seed numbers `1..N`. After seeding
the roster is immutable: registration and withdrawal are status-gated,
so no silent substitutions are possible. The only post-seed roster
change is an audited admin substitution before `live`
(`fn_tournament_adjust`, scope `substitution`, reason required).

## Methods (`fn_seed_tournament`, `@tap/tournament/seeding`)

| Method | Source of order | Stored `source` |
|---|---|---|
| `manual` | Caller-supplied `p_order` (must be exactly the active set) | `manual` |
| `season_ranking` | Frozen season board (snapshot preferred; live board computed once and frozen as the reference when no snapshot exists) | `season_ranking` |
| `random` | Hash order `md5(seed \|\| participant_id)` | `random:{seed}` |

All three are deterministic: the same input always yields the same
seeds. The TypeScript package mirrors this (`seedManual`,
`seedFromRanking`, `seedRandom` with a mulberry32 shuffle for
previews); **SQL hash order is authoritative** for `random`.

## Rules enforced

- Minimum 2 participants (`TOO_FEW_PARTICIPANTS`).
- Manual orders must match the active set exactly (no partial sets,
  no outsiders, no duplicates → `MALFORMED`/`DUPLICATE`).
- `season_ranking` requires `tournaments.season_id` and only ranks
  registered participants; unranked entrants append by id order.
- `random` requires a stored integer seed; the seed is persisted in
  `tournament_seeding.snapshot_ref` so the draw is auditable.
- `(tournament_id, seed)` is unique at the DB level — one seed per
  participant, contiguous `1..N` (validated in TS via
  `validateSeedEntries`).

## Snapshot references

Every seeding row stores `snapshot_ref`: `{method, season_id, seed,
seeded_at}`. For season seeding this is the frozen board that
produced the order — live mutable season points are never re-read
for historical seeding.

## Future methods

Previous-season, clan-war, and leaderboard ranking share the ranked-row
shape (`rankSnapshotRows`: points → earliest → id). They plug into
`fn_seed_tournament` as new `p_method` branches without touching the
bracket generator.
