# Streaks (M5)

Consistency without gamified login rewards: only VALIDATED completions open
or extend streaks. Views, logins and game opens never qualify (the pipeline
only runs for validated attempts — structural, not policy text).

## Model

`streaks` (one row per user: current/best counts, last active date,
timezone, lifetime active days) + `streak_events` (one row per qualifying
day, `UNIQUE(user, date)` — the idempotency anchor that makes same-day
replays safe).

## Rules (mirrored in `@tap/progression` and SQL)

- First qualifying day → 1/1. Same day → unchanged. Yesterday active →
  +1 (best tracks max). Otherwise restart at 1, best preserved.
- Backdated activity never rewrites history.
- No recovery mechanics in M5 (ad-based recovery is an explicit later scope
  with its own audit requirements).

## Timezones

UTC in storage; activity dates via `Intl` (`activityDate()`), default
`Asia/Dhaka`, validated with fallback to UTC on unknown zones. DST-safe
whole-day arithmetic (`daysBetween`). Business logic never assumes a zone.
