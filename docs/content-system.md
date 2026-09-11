# Content System (M4)

`@tap/content` is the source of truth for everything playable; the database
(`0006` tables) is its operational mirror, loaded by `pnpm seed:catalog`
(service role, staging/prod; re-runnable, history-preserving).

## Catalog

- 16 worlds (`worlds.ts`, en+bn UI metadata).
- 26 games (`games.ts`) spanning keyboard/key, letter, word, sentence,
  timed, survival, adventure, advanced — full `GameDefinition` rows.
- 9 prompt sets (`prompts.ts`): letters, home-row, top-row, numbers,
  symbols, beginner/common words, short/standard sentences.
- 3 difficulty profiles (`difficulties.ts`): beginner/intermediate/expert
  (lengths, vocab, error tolerance, targets, durations, complexity mixes).

## Versioning

Games carry `version`; attempts bind `game_version_id`; prompt sets carry
`version` and every built prompt records `(setRef, setVersion, seed, units)`.
`seed-catalog.ts` appends a new `game_versions` row (and bumps
`current_version`) only when the definition JSON actually changed — old
attempts stay reproducible against their bound version forever.

## Deterministic prompts

`buildPrompt(setRef, units, seed)` samples with a seeded PRNG (xmur3 +
mulberry32): identical inputs ⇒ identical text on any runtime. The start
route generates with `crypto.randomUUID()` seeds; validation/audit rebuilds
from the stored tuple.

## Integrity

`validateCatalog()` enforces: definition schema, unique ids/slugs, existing
worlds, known scoring profiles (`@tap/scoring`), known prompt sets, and
`gamesCompleted` prerequisites pointing at real catalog games. The seed
loader refuses to run on validation errors. Large content lives here as
data — never inside React components.
