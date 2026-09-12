-- M9 pgTAP suite: mission definitions, assignment, progress, rewards,
-- isolation. Depends on bootstrap + 0001..0018 + dev seed. BEGIN/ROLLBACK.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: mission admin, B101 teacher/student, B102 teacher/student.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('b0b0b0b0-0000-0000-0000-000000000001', 'm9a@example.com'),
  ('b0b0b0b0-0000-0000-0000-000000000002', 'm9t@example.com'),
  ('b0b0b0b0-0000-0000-0000-000000000003', 'm9t2@example.com'),
  ('b0b0b0b0-0000-0000-0000-000000000004', 'm9s1@example.com'),
  ('b0b0b0b0-0000-0000-0000-000000000005', 'm9s2@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('b0b0b0b0-0000-0000-0000-000000000001', 'm9a@example.com', 'Admin', 'UTC'),
  ('b0b0b0b0-0000-0000-0000-000000000002', 'm9t@example.com', 'Teacher', 'UTC'),
  ('b0b0b0b0-0000-0000-0000-000000000003', 'm9t2@example.com', 'Teacher Two', 'UTC'),
  ('b0b0b0b0-0000-0000-0000-000000000004', 'm9s1@example.com', 'Student One', 'UTC'),
  ('b0b0b0b0-0000-0000-0000-000000000005', 'm9s2@example.com', 'Student Two', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b0b0b0b0-0000-0000-0000-000000000001', 'super_admin'),
  ('b0b0b0b0-0000-0000-0000-000000000002', 'teacher'),
  ('b0b0b0b0-0000-0000-0000-000000000003', 'teacher'),
  ('b0b0b0b0-0000-0000-0000-000000000004', 'student'),
  ('b0b0b0b0-0000-0000-0000-000000000005', 'student');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('b0b0b0b0-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('b0b0b0b0-0000-0000-0000-000000000003',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'b0b0b0b0-0000-0000-0000-000000000004', 'R-01', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'b0b0b0b0-0000-0000-0000-000000000005', 'R-01', 'beginner');

INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('m9-world', 96, 'M9');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('m9-letters', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('b9b9b9b9-9999-9999-9999-999999999999', 'm9-game', 'm9-world',
   'test', 'target-press', 'letter', 'beginner', 'm9-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug = 'm9-game';

SELECT plan(49);

SET ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Definition: admin CRUD, student forbidden, versions.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000004', 'm9s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_mission('{"slug":"x","title":"X"}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'students cannot create missions'
);

SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000001', 'm9a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "m-daily-games", "title": "Daily Grind",
    "category": "DAILY", "objective_type": "GAMES_COMPLETED",
    "target": {"count": 2}, "reward_profile": {"xp": 30, "coins": 3}}'::jsonb)$$,
  'admin creates a daily mission'
);
SELECT throws_ok(
  $$SELECT public.fn_create_mission('{"slug":"m-daily-games","title":"Dup"}'::jsonb)$$,
  'P0001', 'DUPLICATE_SLUG',
  'duplicate slugs rejected'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "m-daily-acc", "title": "Steady Hands",
    "category": "DAILY", "objective_type": "ACCURACY_REACHED",
    "target": {"threshold": 90}}'::jsonb)$$,
  'admin creates an accuracy mission'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "m-daily-wpm", "title": "Swift Keys",
    "category": "DAILY", "objective_type": "WPM_REACHED",
    "target": {"threshold": 30}}'::jsonb)$$,
  'admin creates a WPM mission'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "m-weekly", "title": "Weekly Haul",
    "category": "WEEKLY", "objective_type": "GAMES_COMPLETED",
    "target": {"count": 3}}'::jsonb)$$,
  'admin creates a weekly mission'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "m-locked-weekly", "title": "Veterans Only",
    "category": "WEEKLY", "objective_type": "GAMES_COMPLETED",
    "target": {"count": 1}, "prerequisites": {"minLevel": 99}}'::jsonb)$$,
  'admin creates a gated weekly mission'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "m-multi", "title": "Forest Expedition",
    "category": "EVENT", "objective_type": "GAMES_COMPLETED",
    "target": {"count": 1}}'::jsonb)$$,
  'admin creates a multi-step mission shell'
);
SELECT lives_ok(
  $$SELECT public.fn_add_mission_objective(
    (SELECT id FROM public.missions WHERE slug = 'm-multi'),
    'GAMES_COMPLETED', '{"count": 4}'::jsonb, 0)$$,
  'first objective added'
);
SELECT lives_ok(
  $$SELECT public.fn_add_mission_objective(
    (SELECT id FROM public.missions WHERE slug = 'm-multi'),
    'ACCURACY_REACHED', '{"threshold": 90}'::jsonb, 1)$$,
  'second objective added'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{"slug":"m-hidden","title":"Hidden"}'::jsonb)$$,
  'draft mission created'
);
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{"slug":"m-inactive","title":"Inactive","category":"DAILY"}'::jsonb)$$,
  'inactive draft created'
);

SELECT public.fn_update_mission_draft(
  (SELECT id FROM public.missions WHERE slug = 'm-daily-games'),
  '{"title": "Daily Grind v2"}'::jsonb);
SELECT is(version, 2, 'draft update bumps version')
FROM public.missions WHERE slug = 'm-daily-games';
SELECT is(count(*)::int, 2, 'every version snapshotted')
FROM public.mission_versions
WHERE mission_id = (SELECT id FROM public.missions WHERE slug = 'm-daily-games');

SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'm-daily-games'), 'active');
SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'm-daily-acc'), 'active');
SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'm-daily-wpm'), 'active');
SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'm-weekly'), 'active');
SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'm-locked-weekly'), 'active');
SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'm-multi'), 'active');
SELECT throws_ok(
  $$SELECT public.fn_update_mission_draft(
    (SELECT id FROM public.missions WHERE slug = 'm-daily-games'),
    '{"title": "Nope"}'::jsonb)$$,
  'P0001', 'NOT_DRAFT',
  'active missions reject draft edits'
);

SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000004', 'm9s1@example.com');
SELECT is(count(*)::int, 1, 'students see active missions')
FROM public.missions WHERE slug = 'm-daily-games';
SELECT is(count(*)::int, 0, 'students never see drafts')
FROM public.missions WHERE slug = 'm-hidden';

-- ---------------------------------------------------------------------------
-- Daily assignment: deterministic, timezone-aware, skips drafts.
-- ---------------------------------------------------------------------------
SELECT is(
  public.fn_assign_daily_missions('b0b0b0b0-0000-0000-0000-000000000004'),
  3, 'three dailies assigned');
SELECT is(count(*)::int, 3, 'repeat assign keeps the same set')
FROM public.mission_instances
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004' AND period = 'daily';
SELECT is(count(*)::int, 3, 'one assignment row per mission')
FROM public.daily_mission_assignments
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004';
SELECT is(day, (now() AT TIME ZONE 'UTC')::date, 'assignment day is today')
FROM public.daily_mission_assignments
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004' LIMIT 1;
SELECT is(
  public.fn_mission_tz('b0b0b0b0-0000-0000-0000-000000000004'),
  'UTC'::text, 'timezone comes from the profile');
SELECT is(count(*)::int, 0, 'drafts never enter the daily pool')
FROM public.daily_mission_assignments a
JOIN public.missions m ON m.id = a.mission_id
WHERE a.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug IN ('m-hidden', 'm-inactive');

-- ---------------------------------------------------------------------------
-- Weekly assignment.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000001', 'm9a@example.com');
SELECT public.fn_assign_weekly('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(count(*)::int, 2, 'two weeklies assigned')
FROM public.weekly_challenges
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND week_start = date_trunc('week', now())::date;
SELECT is(count(*)::int, 2, 'weekly assign is idempotent')
FROM public.mission_instances
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004' AND period = 'weekly';

-- ---------------------------------------------------------------------------
-- Start, prerequisites, eligibility reasons.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000004', 'm9s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_start_mission(
    (SELECT i.id FROM public.mission_instances i
     JOIN public.missions m ON m.id = i.mission_id
     WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
       AND m.slug = 'm-daily-games'))$$,
  'student starts an available mission');
SELECT throws_ok(
  $$SELECT public.fn_start_mission(
    (SELECT i.id FROM public.mission_instances i
     JOIN public.missions m ON m.id = i.mission_id
     WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
       AND m.slug = 'm-daily-games'))$$,
  'P0001', 'INVALID_STATE',
  'double start rejected');
SELECT throws_ok(
  $$SELECT public.fn_start_mission(
    (SELECT i.id FROM public.mission_instances i
     JOIN public.missions m ON m.id = i.mission_id
     WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
       AND m.slug = 'm-locked-weekly'))$$,
  'P0001', 'PREREQUISITE',
  'gated mission refuses start');
SELECT ok(
  (public.fn_mission_eligibility(
    (SELECT id FROM public.missions WHERE slug = 'm-locked-weekly'),
    'b0b0b0b0-0000-0000-0000-000000000004') -> 'reasons'
    ? 'REQUIRES_LEVEL_99'),
  'eligibility explains the missing level');

-- ---------------------------------------------------------------------------
-- Progress from validated attempts only; rewards once; immutable history.
-- ---------------------------------------------------------------------------
SELECT is(
  public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004'),
  1, 'only the started instance syncs');
SELECT is(i.status::text, 'active', 'no attempts yet: still active')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';

SELECT public.fn_start_attempt('m9-game', 'beginner', 'm9a', 'M9 run one', 900) AS a1 \gset
SELECT public.fn_submit_attempt(
  :'a1', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(
  ((i.progress -> 'objectives' -> 0 ->> 'current')::int), 1,
  'one validated attempt counts')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';
SELECT is(i.status::text, 'active', 'target of two: still active')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';

SELECT public.fn_start_attempt('m9-game', 'beginner', 'm9b', 'M9 abandoned', 900);
SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(
  ((i.progress -> 'objectives' -> 0 ->> 'current')::int), 1,
  'unsubmitted attempts contribute nothing')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';

SELECT public.fn_start_attempt('m9-game', 'beginner', 'm9c', 'M9 run two', 900) AS a2 \gset
SELECT public.fn_submit_attempt(
  :'a2', '{"totalCharacters":40}'::jsonb, 72, 96, 10, true);
SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(i.status::text, 'completed', 'target reached: completed')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';
SELECT results_eq(
  $$SELECT amount FROM public.xp_ledger
    WHERE source = 'mission'
      AND user_id = 'b0b0b0b0-0000-0000-0000-000000000004'$$,
  $$VALUES (30)$$,
  'completion pays through the M5 ledger once');
SELECT is(count(*)::int, 1, 'one completion event')
FROM public.mission_completion_events
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004';

SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(count(*)::int, 1, 'resync never double-pays')
FROM public.xp_ledger
WHERE source = 'mission'
  AND user_id = 'b0b0b0b0-0000-0000-0000-000000000004';
SELECT is(count(*)::int, 2, 'each attempt logged once')
FROM public.mission_progress p
JOIN public.mission_instances i ON i.id = p.instance_id
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';

SELECT public.fn_start_attempt('m9-game', 'beginner', 'm9d', 'M9 late run', 900) AS a3 \gset
SELECT public.fn_submit_attempt(
  :'a3', '{"totalCharacters":40}'::jsonb, 74, 97, 10, true);
SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(i.status::text, 'completed', 'completed stays completed')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';
SELECT is(
  ((i.progress -> 'objectives' -> 0 ->> 'current')::int), 2,
  'history frozen at completion')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-daily-games';

-- ---------------------------------------------------------------------------
-- Multi-step mission: partial progress, then full completion.
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.fn_join_mission(
    (SELECT id FROM public.missions WHERE slug = 'm-multi'))$$,
  'student joins the event mission');
SELECT lives_ok(
  $$SELECT public.fn_start_mission(
    (SELECT i.id FROM public.mission_instances i
     JOIN public.missions m ON m.id = i.mission_id
     WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
       AND m.slug = 'm-multi'))$$,
  'multi-step mission starts');
SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(i.status::text, 'active', 'one of two objectives: still active')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-multi';

SELECT public.fn_start_attempt('m9-game', 'beginner', 'm9e', 'M9 run four', 900) AS a4 \gset
SELECT public.fn_submit_attempt(
  :'a4', '{"totalCharacters":40}'::jsonb, 76, 98, 10, true);
SELECT public.fn_sync_missions('b0b0b0b0-0000-0000-0000-000000000004');
SELECT is(i.status::text, 'completed', 'all objectives met: completed')
FROM public.mission_instances i
JOIN public.missions m ON m.id = i.mission_id
WHERE i.user_id = 'b0b0b0b0-0000-0000-0000-000000000004'
  AND m.slug = 'm-multi';

-- ---------------------------------------------------------------------------
-- Isolation: students, teachers, admins.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000005', 'm9s2@example.com');
SELECT is(count(*)::int, 0, 'students cannot read each other instances')
FROM public.mission_instances
WHERE user_id = 'b0b0b0b0-0000-0000-0000-000000000004';
SELECT throws_ok(
  $$INSERT INTO public.mission_instances (mission_id, user_id, period, period_start)
    VALUES ('00000000-0000-0000-0000-000000000000',
            'b0b0b0b0-0000-0000-0000-000000000005', 'daily', CURRENT_DATE)$$,
  '42501', 'new row violates row-level security policy for table "mission_instances"',
  'students cannot forge instances');

SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000002', 'm9t@example.com');
SELECT is(count(*)::int, 6, 'batch teacher sees student missions')
FROM public.fn_student_missions('b0b0b0b0-0000-0000-0000-000000000004');

SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000003', 'm9t2@example.com');
SELECT is(count(*)::int, 0, 'out-of-batch teachers see nothing')
FROM public.fn_student_missions('b0b0b0b0-0000-0000-0000-000000000004');

SELECT tests.set_claims('b0b0b0b0-0000-0000-0000-000000000001', 'm9a@example.com');
SELECT is(count(*)::int, 6, 'mission admin sees student missions')
FROM public.fn_student_missions('b0b0b0b0-0000-0000-0000-000000000004');

SELECT * FROM finish();
ROLLBACK;
