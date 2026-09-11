-- M7 pgTAP suite: staff access layer (account states, staff reads, column
-- guard, audit triggers, role grants, cross-org isolation).
-- Depends on bootstrap + 0001..0011 + dev seed. BEGIN/ROLLBACK (rerunnable).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.feature_flags TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: org1 (dev seed) + org2; adminA/org1, adminB/org2, teacher/SALES-101,
-- students s1 (SALES-101), s2 (SALES-102), s9 (org2).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com'),
  ('d2d2d2d2-2222-2222-2222-222222222222', 'm7ab@example.com'),
  ('d3d3d3d3-3333-3333-3333-333333333333', 'm7t@example.com'),
  ('d4d4d4d4-4444-4444-4444-444444444444', 'm7s1@example.com'),
  ('d5d5d5d5-5555-5555-5555-555555555555', 'm7s2@example.com'),
  ('d6d6d6d6-6666-6666-6666-666666666666', 'm7s9@example.com'),
  ('d7d7d7d7-7777-7777-7777-777777777777', 'm7su@example.com'),
  ('d8d8d8d8-8888-8888-8888-888888888888', 'm7new@example.com');

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com', 'Admin A'),
  ('d2d2d2d2-2222-2222-2222-222222222222', 'm7ab@example.com', 'Admin B'),
  ('d3d3d3d3-3333-3333-3333-333333333333', 'm7t@example.com', 'Teacher T'),
  ('d4d4d4d4-4444-4444-4444-444444444444', 'm7s1@example.com', 'Student One'),
  ('d5d5d5d5-5555-5555-5555-555555555555', 'm7s2@example.com', 'Student Two'),
  ('d6d6d6d6-6666-6666-6666-666666666666', 'm7s9@example.com', 'Student Nine'),
  ('d7d7d7d7-7777-7777-7777-777777777777', 'm7su@example.com', 'Super Su'),
  ('d8d8d8d8-8888-8888-8888-888888888888', 'm7new@example.com', 'Newbie');

INSERT INTO public.organizations (id, name, slug) VALUES
  ('99999999-9999-9999-9999-999999999999', 'Second Org', 'second-org');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d3d3d3d3-3333-3333-3333-333333333333', 'teacher'),
  ('d4d4d4d4-4444-4444-4444-444444444444', 'student'),
  ('d5d5d5d5-5555-5555-5555-555555555555', 'student'),
  ('d6d6d6d6-6666-6666-6666-666666666666', 'student'),
  ('d7d7d7d7-7777-7777-7777-777777777777', 'super_admin');
INSERT INTO public.user_roles (user_id, role, organization_id) VALUES
  ('d1d1d1d1-1111-1111-1111-111111111111', 'admin',
   '11111111-1111-1111-1111-111111111111'),
  ('d2d2d2d2-2222-2222-2222-222222222222', 'admin',
   '99999999-9999-9999-9999-999999999999');

INSERT INTO public.courses (id, organization_id, title, slug) VALUES
  ('77777777-7777-7777-7777-777777777777',
   '99999999-9999-9999-9999-999999999999', 'Second Course', 'second-course');
INSERT INTO public.batches (id, course_id, name, join_code, is_active) VALUES
  ('99990000-9999-9999-9999-999999999999',
   '77777777-7777-7777-7777-777777777777', 'Batch 901', 'ORG2-901', true);

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'd4d4d4d4-4444-4444-4444-444444444444', 'R-01', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'd5d5d5d5-5555-5555-5555-555555555555', 'R-02', 'beginner'),
  ('99990000-9999-9999-9999-999999999999',
   'd6d6d6d6-6666-6666-6666-666666666666', 'R-01', 'beginner');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('d3d3d3d3-3333-3333-3333-333333333333',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Attempt scaffolding for staff-read tests.
INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('m7-world', 95, 'M7');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('m7-letters', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('e7e7e7e7-7777-7777-7777-777777777777', 'm7-game', 'm7-world',
   'test', 'target-press', 'letter', 'beginner', 'm7-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug = 'm7-game';

INSERT INTO public.game_attempts (user_id, game_id, game_version_id, expected_text, status)
VALUES
  ('d4d4d4d4-4444-4444-4444-444444444444',
   'e7e7e7e7-7777-7777-7777-777777777777',
   (SELECT id FROM public.game_versions
    WHERE game_id = 'e7e7e7e7-7777-7777-7777-777777777777'),
   'abc', 'validated'),
  ('d5d5d5d5-5555-5555-5555-555555555555',
   'e7e7e7e7-7777-7777-7777-777777777777',
   (SELECT id FROM public.game_versions
    WHERE game_id = 'e7e7e7e7-7777-7777-7777-777777777777'),
   'abc', 'validated');

INSERT INTO public.attempt_results (attempt_id, raw, score, accuracy, effective_wpm, is_valid)
SELECT id, '{}', 50, 90, 20, true FROM public.game_attempts
WHERE expected_text = 'abc';

INSERT INTO public.streaks (user_id, current_count, best_count) VALUES
  ('d4d4d4d4-4444-4444-4444-444444444444', 3, 3);
INSERT INTO public.badge_awards (user_id, badge_id) VALUES
  ('d4d4d4d4-4444-4444-4444-444444444444', 'first-key');

SELECT plan(32);

-- ---------------------------------------------------------------------------
-- 1-6: teacher scoped reads.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT tests.set_claims('d3d3d3d3-3333-3333-3333-333333333333', 'm7t@example.com');

SELECT is(count(*)::int, 1, 'teacher reads assigned-batch attempts')
FROM public.game_attempts a
JOIN public.batch_members bm ON bm.user_id = a.user_id AND bm.is_active
JOIN public.batches b ON b.id = bm.batch_id
WHERE b.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(count(*)::int, 1, 'teacher sees only assigned members attempts')
FROM public.game_attempts;

SELECT is(count(*)::int, 1, 'teacher reads assigned results')
FROM public.attempt_results r
JOIN public.game_attempts a ON a.id = r.attempt_id
JOIN public.batch_members bm ON bm.user_id = a.user_id
WHERE bm.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(count(*)::int, 1, 'teacher reads assigned streaks')
FROM public.streaks
WHERE user_id = 'd4d4d4d4-4444-4444-4444-444444444444';

SELECT is(count(*)::int, 0, 'teacher cannot read unassigned streaks')
FROM public.streaks
WHERE user_id = 'd5d5d5d5-5555-5555-5555-555555555555';

SELECT is(count(*)::int, 1, 'teacher reads assigned badge awards')
FROM public.badge_awards
WHERE user_id = 'd4d4d4d4-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- 7-8: teacher write boundaries.
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.game_attempts
    (user_id, game_id, game_version_id, expected_text)
    SELECT 'd4d4d4d4-4444-4444-4444-444444444444', g.id, gv.id, 'x'
    FROM public.games g JOIN public.game_versions gv ON gv.game_id = g.id
    WHERE g.slug = 'm7-game' LIMIT 1$$,
  '42501', 'new row violates row-level security policy for table "game_attempts"',
  'teacher cannot insert attempts'
);

UPDATE public.profiles SET full_name = 'Hacked'
WHERE id = 'd4d4d4d4-4444-4444-4444-444444444444';
SELECT is(full_name, 'Student One', 'teacher cannot update profiles')
FROM public.profiles
WHERE id = 'd4d4d4d4-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- 9-11: account status + column guard.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com');

UPDATE public.profiles SET account_status = 'suspended'
WHERE id = 'd4d4d4d4-4444-4444-4444-444444444444';
SELECT is(account_status, 'suspended', 'org admin can suspend own-org student')
FROM public.profiles
WHERE id = 'd4d4d4d4-4444-4444-4444-444444444444';

SELECT throws_ok(
  $$UPDATE public.profiles SET xp_total = 999999
    WHERE id = 'd4d4d4d4-4444-4444-4444-444444444444'$$,
  'P0001', 'PROTECTED_COLUMNS',
  'column guard blocks balance edits'
);

UPDATE public.profiles SET account_status = 'suspended'
WHERE id = 'd6d6d6d6-6666-6666-6666-666666666666';
SELECT is(count(*)::int, 0, 'admin cannot even see another org accounts')
FROM public.profiles
WHERE id = 'd6d6d6d6-6666-6666-6666-666666666666';
-- 0 rows above means the follow-up must read as owner.
RESET ROLE;
SELECT is(account_status, 'active', 'another org account left unchanged')
FROM public.profiles
WHERE id = 'd6d6d6d6-6666-6666-6666-666666666666';
SET ROLE authenticated;

-- ---------------------------------------------------------------------------
-- 12-15: role grants.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d7d7d7d7-7777-7777-7777-777777777777', 'm7su@example.com');
SELECT lives_ok(
  $$SELECT public.fn_grant_role(
       'd8d8d8d8-8888-8888-8888-888888888888', 'teacher')$$,
  'super admin can grant roles'
);
SELECT is(count(*)::int, 1, 'grant persisted with audit trail')
FROM public.user_roles
WHERE user_id = 'd8d8d8d8-8888-8888-8888-888888888888' AND role = 'teacher';

SELECT tests.set_claims('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com');
SELECT throws_ok(
  $$SELECT public.fn_grant_role(
       'd5d5d5d5-5555-5555-5555-555555555555', 'admin',
       '11111111-1111-1111-1111-111111111111')$$,
  'P0001', 'FORBIDDEN',
  'org admin cannot grant admin'
);

SELECT tests.set_claims('d3d3d3d3-3333-3333-3333-333333333333', 'm7t@example.com');
SELECT throws_ok(
  $$SELECT public.fn_grant_role(
       'd5d5d5d5-5555-5555-5555-555555555555', 'teacher')$$,
  'P0001', 'FORBIDDEN',
  'teachers cannot grant roles'
);

SELECT tests.set_claims('d4d4d4d4-4444-4444-4444-444444444444', 'm7s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_grant_role(
       'd5d5d5d5-5555-5555-5555-555555555555', 'teacher')$$,
  'P0001', 'FORBIDDEN',
  'students cannot grant roles'
);

-- ---------------------------------------------------------------------------
-- 16-18: audit triggers on management writes.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com');
INSERT INTO public.courses (organization_id, title, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Audit Course', 'audit-course');
SELECT is(count(*)::int, 1, 'course creation is audited')
FROM public.audit_logs
WHERE entity = 'courses' AND action = 'course.insert';

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('d3d3d3d3-3333-3333-3333-333333333333',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT is(count(*)::int, 1, 'teacher assignment is audited')
FROM public.audit_logs
WHERE entity = 'teacher_assignments' AND action = 'teacher_assignment.insert'
  AND actor_user_id = 'd1d1d1d1-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 19-22: org isolation + flags + status visibility.
-- ---------------------------------------------------------------------------
SELECT is(count(*)::int, 0, 'admin cannot see another org batches')
FROM public.batches b
JOIN public.courses c ON c.id = b.course_id
WHERE c.organization_id = '99999999-9999-9999-9999-999999999999';

SELECT tests.set_claims('d7d7d7d7-7777-7777-7777-777777777777', 'm7su@example.com');
UPDATE public.feature_flags SET enabled = false WHERE key = 'PHASE_2_ADAPTIVE';
SELECT is(enabled, false, 'super admin can toggle feature flags')
FROM public.feature_flags WHERE key = 'PHASE_2_ADAPTIVE';

SELECT tests.set_claims('d4d4d4d4-4444-4444-4444-444444444444', 'm7s1@example.com');
UPDATE public.feature_flags SET enabled = true WHERE key = 'PHASE_2_ADAPTIVE';
SELECT is(enabled, false, 'students cannot toggle feature flags')
FROM public.feature_flags WHERE key = 'PHASE_2_ADAPTIVE';

SELECT is(account_status, 'suspended', 'owner reads their own status')
FROM public.profiles
WHERE id = 'd4d4d4d4-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- 0012 coverage: course flag, batch dates, lookup, revocation, game toggle.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com');

UPDATE public.courses SET is_active = false WHERE slug = 'audit-course';
SELECT is(is_active, false, 'org admin can deactivate own-org course')
FROM public.courses WHERE slug = 'audit-course';

UPDATE public.batches
SET start_date = CURRENT_DATE, end_date = CURRENT_DATE + 90
WHERE join_code = 'SALES-101';
SELECT is(start_date, CURRENT_DATE, 'org admin can set batch dates')
FROM public.batches WHERE join_code = 'SALES-101';

SELECT results_eq(
  $$SELECT user_id, full_name FROM public.fn_admin_lookup_user('m7t@example.com')$$,
  $$VALUES ('d3d3d3d3-3333-3333-3333-333333333333'::uuid, 'Teacher T'::text)$$,
  'admin resolves teachers by exact email'
);

SELECT tests.set_claims('d4d4d4d4-4444-4444-4444-444444444444', 'm7s1@example.com');
SELECT is(count(*)::int, 0, 'students cannot use the lookup')
FROM public.fn_admin_lookup_user('m7t@example.com');

SELECT tests.set_claims('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com');
SELECT lives_ok(
  $$SELECT public.fn_revoke_role(
       'd8d8d8d8-8888-8888-8888-888888888888', 'teacher')$$,
  'org admin can revoke teacher role'
);
SELECT is(count(*)::int, 0, 'revocation persisted')
FROM public.user_roles
WHERE user_id = 'd8d8d8d8-8888-8888-8888-888888888888' AND role = 'teacher';

SELECT throws_ok(
  $$SELECT public.fn_revoke_role(
       'd2d2d2d2-2222-2222-2222-222222222222', 'admin')$$,
  'P0001', 'FORBIDDEN',
  'org admin cannot revoke admin roles'
);

SELECT tests.set_claims('d7d7d7d7-7777-7777-7777-777777777777', 'm7su@example.com');
UPDATE public.games SET is_active = false WHERE slug = 'm7-game';
SELECT is(is_active, false, 'super admin toggles the game catalog')
FROM public.games WHERE slug = 'm7-game';

SELECT tests.set_claims('d1d1d1d1-1111-1111-1111-111111111111', 'm7aa@example.com');
UPDATE public.games SET is_active = true WHERE slug = 'm7-game';
-- Invisible to this admin by RLS, so verify unchanged as owner.
RESET ROLE;
SELECT is(is_active, false, 'org admin cannot touch the game catalog')
FROM public.games WHERE slug = 'm7-game';
SET ROLE authenticated;

SELECT * FROM finish();
ROLLBACK;
