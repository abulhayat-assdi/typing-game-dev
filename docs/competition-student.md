# Competition student guide (M8)

Hub (`/[locale]/competitions`): upcoming, registration-open, live and
completed sections. Cards show title, type, game, server start/end,
status, attempt limit and reward preview. Details show rules, scoring
method, eligibility, schedule, attempts and rewards — all
server-authoritative; the countdown is display-only (server timestamps
anchor it; tab suspend/reconnect just repaints).

Registration: one entry per competition (`UNIQUE(competition_id,
user_id)`); ineligible or closed windows get a clear state, never a
silent failure. Live: enter via the normal Play button (same M4/M6 game
runtime — no second engine), then "attach latest" binds the newest
validated attempt to the competition. Near-deadline submits are decided
by server timestamps, never the client clock.

Results: after `finalized`, rank/score/WPM/accuracy/attempts/rewards from
immutable result rows. Rewards land in the normal M5 balances
(XP/coins/badges) — there is no separate competition currency.
Leaderboard rows expose display names only.

API (all authenticated; RLS underneath):
`GET /api/competitions`, `GET /api/competitions/[id]`,
`POST .../[id]/register` (201, 409 duplicate/ineligible),
`GET .../[id]/leaderboard`, `GET .../[id]/results`,
`POST .../[id]/attach` (`{attemptId}` or `{latest:true}`).
