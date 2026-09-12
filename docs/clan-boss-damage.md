# Clan boss damage (M12)

Damage is data-driven from server-computed result metrics, never raw
XP and never client numbers. `scoring_profile` selects the formula:

- `score_x_mult`: `floor(score × multiplier)`
- `wpm_x_acc`: `floor(wpm × accuracy/100 × multiplier × accuracy_factor)`

multiplied by the current phase's `damage_multiplier`. Phases are HP
bands `(hp_to, hp_from]` resolved server-side after every hit;
boundaries belong to the next phase. Phases may restrict games/worlds
and set `min_accuracy` bars; violations fail as `GAME_NOT_ALLOWED` /
`BELOW_PHASE_BAR` before any accounting.

Concurrency: `fn_submit_boss_attempt` locks the instance row first, so
simultaneous members serialize — no lost updates, `HP = max(0, HP −
damage)` never negative, one phase event per crossing, one damage
event per attempt (`boss:{instance}:attempt:{attempt}:damage:v1`,
UNIQUE attempt). Replays raise `DUPLICATE`.

Boss damage is tracked separately from ordinary clan contribution:
validated attempts still mint exactly one `clan_contributions` row via
the M10 trigger at validation time, while boss hits write only
`boss_damage_events`/`boss_attempts` — two lenses, one play, no
double-count.
