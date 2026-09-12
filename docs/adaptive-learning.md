# Adaptive Learning (M15)

The platform moves from "here are many typing games" to "I understand
where this student is weak, and I know what they should practice
next" — without touching the M4 engine, M5 progression, or M9
missions. Adaptive consumes validated history and produces
recommendations.

```
VALIDATED ATTEMPTS → skill/weakness analysis → player skill profile
  → recommendation engine → personalized game/mission
  → new attempt → updated profile
```

## Loop wiring

`POST /api/games/[id]/attempts/[attemptId]/submit` gains a
best-effort adaptive hook: after a validated submit it aligns
expected vs typed position-wise (`@tap/adaptive alignKeys`) and calls
`fn_record_adaptive_attempt` + `fn_refresh_adaptive_profile`. Failures
never fail the submit; `fn_adaptive_sweep()` replays refresh later.

## Performance contract

- Ingest (`fn_record_adaptive_attempt`) is O(prompt length): one
  sample insert plus key/pair upserts.
- Analytics (`fn_adaptive_recompute`) runs post-attempt and on sweep
  only — dashboards read cached rows via `fn_get_adaptive_summary`.
- Never any multi-table analytics per render.

## Tables (`0031_adaptive.sql`)

`learner_skill_profiles` (cache header + band), 19-row
`learner_skill_dimensions`, `adaptive_key_stats`,
`adaptive_finger_stats`, `adaptive_error_pairs`, one-row-per-attempt
`adaptive_attempt_samples`, `adaptive_skill_trends`,
`adaptive_weaknesses` (ranking cache), `adaptive_recommendations`
(supersede, never mutate), `adaptive_recommendation_events`,
`adaptive_exposure` (fatigue), `adaptive_game_difficulty` (runtime
layer). Relational throughout — no giant JSON blobs.

## Algorithm versioning

`ALGO_VERSION = adaptive-v1` tags profiles and recommendations;
thresholds live in `ALGO_CONFIG` with documented rationale. Future
tuning compares versions instead of rewriting history.

## API / UI

- `GET /api/adaptive` (summary), `POST /api/adaptive/refresh`,
  `POST /api/adaptive/feedback`, `GET /api/adaptive/practice`.
- Staff: `GET /api/admin/adaptive/batch?batchId=`,
  `GET /api/admin/adaptive/global`.
- Pages: `/{locale}/recommended`, `/{locale}/practice`, dashboard
  "Recommended Next" widget, teacher batch board, admin analytics.

See `skill-model.md`, `recommendations.md`, `adaptive-difficulty.md`,
`adaptive-privacy.md`.
