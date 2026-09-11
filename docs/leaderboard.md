# Leaderboard (M6)

`fn_batch_leaderboard(batch, window, limit)` (migration 0010, additive —
M2 untouched): membership/staff gate inside, UTC windows
(today/week/month/all), rank by window XP → accuracy → WPM → name. Returns
only public fields (rank, name, roll, level, totals, window XP, attempts,
averages, streak, latest 3 badge slugs).

The page passes `?window=`/`?batch=` straight through — a forged batch hits
`NOT_MEMBER` inside the function and renders the in-page forbidden state,
never another batch's rows. Top-3 medals (aria-hidden, rank text remains),
current-user highlight, per-window tabs, empty states. Healthy framing only:
no loss-streak callouts, no private metrics (email/coins never leave the
server; `toPublicProfile` strips them by construction).
