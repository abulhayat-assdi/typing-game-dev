# Content Scale-Up Design (M19, Track B)

How the catalog grows from 26 to 100–200+ games **without touching core
code**. All mechanics below are implemented as data + validators in
`@tap/content` (`scale-schema`, `scale-templates`, `scale-matrices`,
`scale-batch-validation`, `scale-roadmap*`); `pnpm validate:content` is
the gate, `scripts/import-content-batch.ts` is the workflow.

## 1. Game Content Schema

`BatchGameSpec` (`scale-schema.ts`) is the authoring unit: slug, en (+bn)
title/description, world, category, mechanic, mode, difficulty,
skillBands, **skillFocus[1-3]** (21 focuses, `SKILL_FOCUSES`), prompt
ref + units, timing, scoring profile, unlock rule, optional
attempt/input overrides, theme, mechanic config, mission tags, reward
keys, competition flag, demo flag. `toGameDefinition()` expands a spec
through its mechanic template into a full `GameDefinition` — this
function is the executable proof of the no-core-code rule.

Schema extensions over M4: `SkillFocus` (21 values), `MechanicTemplate`,
`DifficultyCell`/`KIND_UNITS_BANDS`, `RoadmapSlot`, `PLANNED_PROMPT_SETS`
(9 reserved refs), and two new `PromptKind`s (`paragraphs`,
`shortcuts`) with joiners + mode mappings. All additive; shipped rows,
routes, and engines untouched.

## 2. Game Creation Checklist

`docs/new-game-checklist.md` + the M19 gates appendix (9 original steps
plus matrix-cell claim, fingerprint clearance, asset manifest, reward
registry, roadmap slot reference). The pipeline enforces it; reviewers
do not rely on memory.

## 3. Game Template System

19 slots, 14 templates (`MECHANIC_TEMPLATES`): clone template + fill
content = new game. Each template carries design intent, supported
modes, default timing/input/attempt/scoring (mirroring shipped shapes),
required config keys, suggested skills, and a renderer contract. 9
mechanics render today; 5 (`defense-shield`, `boss-phased`,
`duel-rounds`, `endless`, `relay-team`) need a **one-time M20 renderer
each** — afterwards every game of that mechanic is data-only forever.
Adding a *game* never needs core work; adding a *mechanic renderer* is a
once-per-mechanic UI task (no scoring/mission/migration changes).

## 4. Mechanic Matrix

`MECHANIC_MODE_PLACEMENTS`: all 26 shipped placements, self-tested
against `GAMES` so the matrix cannot drift. Empty cells are addressable;
zero-placement mechanics/modes (`UNUSED_MECHANICS`, `UNUSED_MODES`) are
the M20 priority backlog. Near-clone rule: same mechanic x mode x
difficulty x prompt x timing x scoring x units = reject; same cell with
different units = warning requiring session-length justification.

## 5. World Matrix

`WORLD_MATRIX`: 16 worlds keep their adventure identity with skill-band
ownership and capacities summing to exactly 100/200. Empty worlds
(finger-forest, desert-rally, ocean-depths, arctic-pass) are filled
first in the 100-plan.

## 6. Difficulty Matrix

`DIFFICULTY_MATRIX` tiers mirror `DIFFICULTY_PROFILES` plus units bands
calibrated so **every shipped game passes** (beginner 3–24,
intermediate 5–48, expert 8–60). `KIND_UNITS_BANDS` overrides for
paragraphs (1–8) and shortcuts (6–30), which count sessions not
keystrokes. Prompt-kind/mode compatibility comes from `modesForKind()`
(every kind also serves `mixed`, matching shipped usage).

## 7. Prompt Content Strategy

9 shipped sets stay frozen (versioned, attempt-bound). 9 planned sets
(`PLANNED_PROMPT_SETS`: numbers/symbols-extended, code-tokens,
punctuated/capitalized sentences, paragraphs-starter, story-chapters,
shortcut basics/pro) land in M20 with the same seeded-PRNG determinism.
Roadmap slots may reference planned refs; full batch specs require live
sets (importer rejects unknown refs).

## 8. Unlock Strategy

Progressive chains per world using existing `UnlockRule` combinators:
open → level/xp → `gamesCompleted` prerequisites → accuracy/wpm gates →
badges. Boss-preparation and competitive-preparation games sit behind
explicit prerequisite chains (gateways, not surprises). The validator
rejects `gamesCompleted` refs pointing outside the catalog + batch.

## 9. Mission Integration Strategy

Games declare `missionTags` (charset-checked); mission authoring matches
tags as data — no per-game mission code, no engine change. Clan-mission
linking consumes the same tags.

## 10. Reward Strategy

`rewardEventKeys` reference `reward_events` keys; the importer rejects
malformed keys and (with `--reward-registry`) unregistered ones. New
games reuse the 6 scoring profiles unless a new profile ships with its
own migration + seed. No mint/transfer/cash-out paths, ever.

## 11. Preview/Demo Strategy

Every game ships `games/{slug}/preview.png` + `art.png` (public R2,
cache-friendly). Zero-stakes guest demos render from the definition
alone (`demoPlayable`, default true) with no XP/ledger writes.

## 12. R2 Asset Requirements

`requiredAssetsFor(slug)` derives the manifest; the importer rejects
batches whose slugs lack keys in the supplied `--assets` listing.
World-level art is reused, never duplicated per game. Size budgets per
the load-testing watchlist.

## 13. QA Checklist (per batch of 10–20)

`validate-content` green → importer dry-run clean (zero errors;
warnings justified in the batch notes) → `--apply` to **staging** →
start→submit→validate→progression→unlock smoke via existing routes →
i18n en+bn → preview resolves → mission hook fires → integrity gate
green. Any failure blocks the batch, not just the game. Rollback =
`is_active=false`, never row deletion.

## 14–15. Roadmaps

`ROADMAP_100` (26 derived shipped + 74 planned) and `ROADMAP_200` (+100
depth: expert variants, ranked ladders, boss gauntlets, theme reskins).
Both validate clean with coverage gates (skills ≥2/≥4, all 14 mechanics,
all 9 modes, worlds within capacity). Slots are planning records — the
only M20 input queue.

## 16. Content Import/Seed Workflow

`scripts/import-content-batch.ts`: validate (default dry-run) → report →
`--apply` expands specs via templates and upserts through `seed-lib.ts`
(the exact `seed-catalog.ts` path: same row shape, version-append
semantics, history never rewritten). Prod-shaped targets require
`--i-am-sure`; placeholders fail closed. `seed-catalog.ts` itself was
refactored to share `seed-lib.ts` with zero behavior change.

## 17. New Game Without Core Code (recipe)

1. Claim a matrix cell + roadmap slot. 2. Write the `BatchGameSpec`
(from the mechanic template). 3. Point at a live prompt set. 4. Set
unlock rule + scoring ref. 5. Upload 2 R2 assets. 6. Add en (+bn)
titles. 7. Importer dry-run green. 8. `--apply` to staging, smoke,
integrity. No route, page, API, migration, or engine change — the
pipeline rejects anything that would need one (unknown mechanic/mode,
unknown prompt/scoring/world, dangling unlocks).
