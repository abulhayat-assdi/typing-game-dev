# Dashboard (M6)

Answers "what next?" before anything else: Continue Adventure (recommended
game) primary, Explore Games secondary. Below: level + XP-to-next (server
thresholds), streak, averages, batch rank (from the leaderboard fn, silently
omitted on failure), latest badge, recent activity.

Recommendation is a display-order heuristic over existing server state
(unlocked-but-incomplete in catalog order) — unlock truth stays in
`game_unlocks`, written by the progression function. New users (zero
validated runs) get the three-step `WelcomeBanner` instead of empty charts.

World map renders all 16 catalog worlds with verdict-driven statuses
(complete/current/open/locked), per-world progress and next-game links;
grids collapse to one column on mobile by design. Library filters/sorts/
searches client-side over server-enriched rows (`filterGames`/`sortGames`
are pure, tested utils). Locked cards show reasons + prep from the unlock
verdict and never link to play.
