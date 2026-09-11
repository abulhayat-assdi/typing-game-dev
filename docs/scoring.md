# Scoring (M4)

`@tap/scoring` — deterministic raw metrics + profile-driven scores. Rewards
(XP/coins, later milestones) consume stored scores; they never influence them.

## Raw metrics (`metrics.ts`)

`computeRawMetrics()` derives duration, totals, correct/incorrect,
corrections, error strokes, words, accuracy, raw/effective WPM and completion
from attempt evidence. Total function: zero characters, zero/negative
duration and inconsistent counts (correct > typed) clamp to sane zeros —
never NaN, never negative.

Formulas (spec): `WPM = (correct/5)/minutes`,
`accuracy = correct/typed*100` (raw WPM uses all typed chars).

## Profiles (`profiles.ts`)

Six data-only profiles — `standard, speed, accuracy, survival, boss,
clan-aggregate` — each `{ wpmWeight, accuracyWeight, completionBonus,
flawlessBonus, multiplier }`, mirrored in the `scoring_profiles` table.
New games pick an id; tuning a profile never rewrites the engine.

`score = (wpm·wW + acc·wA + completion·bonus + flawless?) · multiplier`,
rounded to 2dp with a full breakdown returned for audit display.

## Independence

The game-engine boundary validator re-derives accuracy/WPM itself rather
than importing this package: a scoring bug can never launder a forged
submission. Both implementations are pinned by tests to identical outputs
for identical inputs.
