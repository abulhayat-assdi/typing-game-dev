# Student Experience (M6)

Routes live under `/[locale]/(student)/…` (dashboard, map, games,
games/[gameSlug], play/[attemptId], profile, leaderboard, progress). The group
layout gates sessions (redirect to login) and forces dynamic rendering —
required because the fail-closed session read would otherwise let a
logged-out prerender bake in (verified via prerender-manifest: only `/`,
`/en`, `/bn`, `/_not-found`, `/icon.svg` are static).

## Data flow

Pages are async Server Components reading through `StudentStore`
(`lib/server/student-store.ts`: Supabase user-scoped impl + memory impl).
Composition (`student.ts`, `games.ts`) selects/joins/shapes only — XP,
levels, streaks, badges, unlocks and scores are never recomputed in UI code.
`getBatchLeaderboard` resolves the member's batch and lets
`fn_batch_leaderboard` enforce isolation (forged batch params 403 in-page).

## Caching

Student pages are per-request (private state). Public catalog metadata
(worlds, game copy) travels inside the same responses — no shared cache
entries, so one student's private rows can never poison another's.
`getGameDetails` merges DB operational state with the `@tap/content` copy
catalog by slug.

## Responsive / a11y

Mobile-first grids (`grid-cols-2` → `md:4`), horizontal module nav with
overflow scroll, tables wrapped in horizontal scroll regions, 16px+ game
input (no iOS zoom), visible focus, skip link, announced loading/error
states, `aria-current` nav/pages, live regions only for phase changes
(never per-keystroke).
