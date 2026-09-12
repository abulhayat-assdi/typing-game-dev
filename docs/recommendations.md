# Recommendations (M15)

## Selection

For each top weakness signal (by score), candidates are active games
whose prompt-set kind matches the signal, unlocked for the learner
(`game_unlocks` or open rule — locked games are never bypassed).
Priority mirrors the TS weights (`ALGO_CONFIG.weights`, sum = 1):

```
0.30 skillGap + 0.15 confidence + 0.15 trendUrgency + 0.10 relevance
+ 0.10 difficultyFit + 0.10 freshness + 0.05 mission + 0.05 unlock
```

Diversity: games shown ≥2 times in 7 days are filtered
(`adaptive_exposure`), so the same game is never spammed.

## Reason codes (machine-readable)

`WEAK_KEY`, `WEAK_FINGER`, `LOW_ACCURACY`, `LOW_WPM`,
`DECLINING_TREND`, `UNLOCK_PREPARATION` (locked target → unlocked
preparation game first, preserving adventure progression),
`DAILY_MISSION`, `WEEKLY_CHALLENGE` (today's assigned instances —
referenced, never created), `PERSONAL_BEST_OPPORTUNITY` (starter /
near-PB fallback). The UI "Why am I seeing this?" badge shows the
code; messages stay positive and mission-like ("P/O needs a little
more practice", never "you are bad at P/O").

## Practice generator

`buildPracticeDrill` selects from caller-supplied curated lists only
(web passes `@tap/content` `PROMPT_SETS` words/sentences): items
containing the weak keys, shorter (easier) first, each weak key
covered before repeats. No synthesized text — unsafe/invalid content
is impossible by construction. The drill rides the unchanged game
flow (existing game + server prompt snapshot).

## Mission integration

M9 stays authoritative. Adaptive references today's
`daily_mission_assignments` / week `weekly_challenges` instances
whose `game_constraints.games` include the candidate — prioritizing
personalized instances without creating anything.

## Feedback + effectiveness

`fn_adaptive_feedback` records `shown/started/completed/abandoned/
skipped` (ownership-checked; score writes impossible — the fn only
inserts events and flips rec status). `fn_adaptive_global_summary`
reports the funnel plus per-game completion for future tuning.
