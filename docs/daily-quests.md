# Daily quests (M9)

Every eligible student gets 3 daily missions from the active pool
(`fn_assign_daily_missions`). Selection is deterministic per user/day
(`md5(user||day||mission)`, mirrored by `pickDaily` in `@tap/missions`):
same set all day, rotation across days and users, no per-refresh
randomness. Repeat assigns are idempotent (`ON CONFLICT DO NOTHING` on
`mission_id/user_id/period_start` and the assignment rows).

Timezone-aware: the day grain comes from `profiles.timezone`
(`fn_mission_tz`, UTC fallback), so "today" follows the student's
clock. Missions naming locked games are excluded from the pool
(explicit `unlocked=false` rows); the UI additionally renders live
`lockedReasons` from the M6 unlock evaluator, so a locked game is never
recommended.

Lifecycle per quest: assigned `available` → student taps Start
(`fn_start_mission`, prerequisites re-checked with human reasons from
`fn_mission_eligibility`) → `active` → validated play accumulates via
`fn_sync_missions` (also triggered on hub/dashboard loads) → `completed`
+ automatic M5 reward. Hub (`/[locale]/missions`) shows progress bars,
reward preview and time framing; the dashboard embeds Today's Missions
and the weekly widget.
