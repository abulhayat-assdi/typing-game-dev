# Unlocks, Badges, Achievements, Records (M5)

## Unlocks

`evaluateUnlock(stats, rule)` (`@tap/progression`) handles open / level /
XP / accuracy / WPM / missions / games / badge leaves with AND/OR/nesting,
returning `{ unlocked, reasons, missing }` — the future UI renders `missing`
verbatim as "why locked". SQL `fn_check_unlock` mirrors the evaluable subset
for the `game_unlocks` cache; `missionsCompleted` rules stay locked until
mission tables exist (conservative by design).

## Badges vs achievements

- Badges = collectible identity (`badges` + one-time `badge_awards`;
  criteria kinds: first_completion, accuracy/wpm minimums, streak days,
  word totals, games completed, zero-error runs). 11 Phase-1 badges seeded;
  competition/clan/seasonal/elite mechanics are out of scope (categories
  reserved in the CHECK).
- Achievements = milestone records (`achievements` + `achievement_awards`
  storing the breaching value): chars/words totals, attempt counts, peak
  WPM/accuracy, streak bests. 10 seeded.

## Personal records

Per (user, game, metric): best WPM/accuracy/score, fastest full-completion
ms, most characters. Strictly-better-wins upserts (ties keep the older
attempt); clients have no write path. Longest-combo records wait on event
evidence (see `docs/progression.md`).
