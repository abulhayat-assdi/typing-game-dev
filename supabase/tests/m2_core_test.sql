-- M2 pgTAP suite: identity/org core, registration, RLS batch isolation.
-- Run inside the docker verification DB (see supabase/README.md). The file is
-- wrapped in BEGIN/ROLLBACK so reruns start clean. All role switches use
-- SET ROLE authenticated + tests.set_claims() to exercise RLS as the API would.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Stock-Postgres grants (Supabase ships these by default; the test container
-- needs them explicitly so RLS — not missing privileges — decides access).
GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.feature_flags TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

-- ---------------------------------------------------------------------------
-- Deterministic error capture: returns 'OK:<id>' or 'ERR:<message>' so tests
-- assert exact strings instead of depending on client error-format details.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.attempt_register(
  p_join_code text, p_roll text, p_name text, p_track public.skill_track
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT public.fn_register_with_batch(p_join_code, p_roll, p_name, p_track) INTO v_id;
  RETURN 'OK:' || v_id::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION tests.attempt_insert_member(
  p_batch uuid, p_user uuid, p_roll text
)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track)
  VALUES (p_batch, p_user, p_roll, 'beginner');
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION tests.attempt_insert_role(p_user uuid, p_role public.user_role)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user, p_role);
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (superuser bypasses RLS here; policies are tested below as roles).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('01010101-0101-0101-0101-010101010101', 's1@example.com'),
  ('02020202-0202-0202-0202-020202020202', 's2@example.com'),
  ('04040404-0404-0404-0404-040404040404', 's4@example.com'),
  ('05050505-0505-0505-0505-050505050505', 's5@example.com'),
  ('06060606-0606-0606-0606-060606060606', 's6@example.com'),
  ('10101010-1010-1010-1010-101010101010', 't1@example.com'),
  ('20202020-2020-2020-2020-202020202020', 'a1@example.com'),
  ('30303030-3030-3030-3030-303030303030', 'su@example.com');

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('10101010-1010-1010-1010-101010101010', 't1@example.com', 'Teacher One'),
  ('20202020-2020-2020-2020-202020202020', 'a1@example.com', 'Admin One'),
  ('30303030-3030-3030-3030-303030303030', 'su@example.com', 'Super One'),
  ('06060606-0606-0606-0606-060606060606', 's6@example.com', 'Student Six');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('10101010-1010-1010-1010-101010101010', 'teacher'),
  ('30303030-3030-3030-3030-303030303030', 'super_admin');
INSERT INTO public.user_roles (user_id, role, organization_id) VALUES
  ('20202020-2020-2020-2020-202020202020', 'admin',
   '11111111-1111-1111-1111-111111111111');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('10101010-1010-1010-1010-101010101010',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Second org for cross-org isolation tests.
INSERT INTO public.organizations (id, name, slug) VALUES
  ('99999999-9999-9999-9999-999999999999', 'Second Org', 'second-org');
INSERT INTO public.courses (id, organization_id, title, slug) VALUES
  ('88888888-8888-8888-8888-888888888888',
   '99999999-9999-9999-9999-999999999999', 'Second Course', 'second-course');
INSERT INTO public.batches (id, course_id, name, join_code, is_active) VALUES
  ('99990000-9999-9999-9999-999999999999',
   '88888888-8888-8888-8888-888888888888', 'Batch 901', 'ORG2-901', true);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('06060606-0606-0606-0606-060606060606', 'student');
INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('99990000-9999-9999-9999-999999999999',
   '06060606-0606-0606-0606-060606060606', 'R-001', 'beginner');

SELECT plan(30);

-- ---------------------------------------------------------------------------
-- 1-10: registration (student JWT call path)
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT tests.set_claims('01010101-0101-0101-0101-010101010101', 's1@example.com');

SELECT matches(
  tests.attempt_register('SALES-101', 'R-001', 'Student One', 'beginner'),
  '^OK:',
  's1 registers into Batch 101'
);

SELECT results_eq(
  $$SELECT email, full_name FROM public.profiles
    WHERE id = '01010101-0101-0101-0101-010101010101'$$,
  $$VALUES ('s1@example.com'::text, 'Student One'::text)$$,
  'profile created from verified JWT email, not arguments'
);

SELECT is(
  count(*)::int, 1,
  'student role granted on registration'
) FROM public.user_roles
WHERE user_id = '01010101-0101-0101-0101-010101010101' AND role = 'student';

SELECT tests.set_claims('02020202-0202-0202-0202-020202020202', 's2@example.com');
SELECT matches(
  tests.attempt_register('SALES-101', 'R-002', 'Student Two', 'beginner'),
  '^OK:',
  's2 registers into Batch 101'
);

SELECT tests.set_claims('04040404-0404-0404-0404-040404040404', 's4@example.com');
SELECT matches(
  tests.attempt_register('TELE-201', 'R-001', 'Student Four', 'intermediate'),
  '^OK:',
  's4 registers into Batch 201'
);

SELECT tests.set_claims('05050505-0505-0505-0505-050505050505', 's5@example.com');
SELECT matches(
  tests.attempt_register('SALES-101', 'R-001', 'Student Five', 'beginner'),
  'ROLL_TAKEN',
  'duplicate roll inside the same batch is rejected'
);

SELECT matches(
  tests.attempt_register('SALES-102', 'R-001', 'Student Five', 'beginner'),
  '^OK:',
  'same roll number is allowed in a different batch'
);

SELECT matches(
  tests.attempt_register('NOPE-999', 'R-009', 'Student Five', 'beginner'),
  'INVALID_JOIN_CODE',
  'unknown join code is rejected'
);

SELECT tests.set_claims('01010101-0101-0101-0101-010101010101', 's1@example.com');
SELECT matches(
  tests.attempt_register('TELE-201', 'R-010', 'Student One', 'beginner'),
  'ALREADY_ENROLLED',
  'a second active batch enrolment is rejected'
);

SELECT tests.clear_claims();
SELECT matches(
  tests.attempt_register('SALES-101', 'R-010', 'Nobody', 'beginner'),
  'NOT_AUTHENTICATED',
  'registration without a session is rejected'
);

-- ---------------------------------------------------------------------------
-- 11-17: batch isolation for students
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('01010101-0101-0101-0101-010101010101', 's1@example.com');

SELECT is(count(*)::int, 1, 'student sees their own batch') FROM public.batches
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(count(*)::int, 0, 'student cannot see another batch') FROM public.batches
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT is(count(*)::int, 2, 'student sees same-batch peers') FROM public.batch_members
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(count(*)::int, 0, 'student cannot see other-batch members') FROM public.batch_members
WHERE batch_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT matches(
  tests.attempt_insert_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '01010101-0101-0101-0101-010101010101', 'R-HACK'),
  '^ERR:42501',
  'direct membership insert is denied by RLS'
);

SELECT matches(
  tests.attempt_insert_role(
    '01010101-0101-0101-0101-010101010101', 'admin'),
  '^ERR:42501',
  'direct role grant is denied by RLS'
);

UPDATE public.batch_members SET roll_number = 'HACKED'
WHERE user_id = '01010101-0101-0101-0101-010101010101';
SELECT is(roll_number, 'R-001', 'student cannot change their own roll number')
FROM public.batch_members
WHERE user_id = '01010101-0101-0101-0101-010101010101';

-- ---------------------------------------------------------------------------
-- 18-21: teacher scope separation
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('10101010-1010-1010-1010-101010101010', 't1@example.com');

SELECT is(count(*)::int, 2, 'teacher reads assigned-batch student profiles')
FROM public.profiles p
JOIN public.batch_members bm ON bm.user_id = p.id
WHERE bm.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND bm.is_active;

SELECT is(count(*)::int, 0, 'teacher cannot read unassigned-batch profiles')
FROM public.profiles p
JOIN public.batch_members bm ON bm.user_id = p.id
WHERE bm.batch_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND bm.is_active;

SELECT matches(
  tests.attempt_insert_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '10101010-1010-1010-1010-101010101010', 'R-T'),
  '^ERR:42501',
  'teacher cannot insert memberships directly'
);

UPDATE public.batch_members SET roll_number = 'T-HACK'
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND user_id = '02020202-0202-0202-0202-020202020202';
SELECT is(roll_number, 'R-002', 'teacher cannot change roll numbers')
FROM public.batch_members
WHERE user_id = '02020202-0202-0202-0202-020202020202';

-- ---------------------------------------------------------------------------
-- 22-26: admin roll correction + audit trail
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('20202020-2020-2020-2020-202020202020', 'a1@example.com');

UPDATE public.batch_members SET roll_number = 'R-001-FIXED'
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND user_id = '01010101-0101-0101-0101-010101010101';
SELECT is(roll_number, 'R-001-FIXED', 'org admin can correct a roll number')
FROM public.batch_members
WHERE user_id = '01010101-0101-0101-0101-010101010101';

SELECT is(count(*)::int, 1, 'roll change wrote an audit row with old/new values')
FROM public.audit_logs
WHERE action = 'batch_member.updated'
  AND metadata ->> 'new_roll_number' = 'R-001-FIXED'
  AND metadata ->> 'old_roll_number' = 'R-001';

SELECT tests.set_claims('30303030-3030-3030-3030-303030303030', 'su@example.com');
SELECT is(count(*)::int, 1, 'super admin can read the audit trail')
FROM public.audit_logs
WHERE action = 'batch_member.updated'
  AND metadata ->> 'new_roll_number' = 'R-001-FIXED';

SELECT tests.set_claims('01010101-0101-0101-0101-010101010101', 's1@example.com');
SELECT is(count(*)::int, 0, 'students cannot read audit logs')
FROM public.audit_logs;

SELECT is(count(*)::int, 1, 'student reads their own private profile')
FROM public.profiles
WHERE id = '01010101-0101-0101-0101-010101010101';

-- ---------------------------------------------------------------------------
-- 27-28: flags readable, not writable
-- ---------------------------------------------------------------------------
SELECT is(count(*)::int, 5, 'feature flags are readable') FROM public.feature_flags;

UPDATE public.feature_flags SET enabled = false WHERE key = 'PHASE_1_CORE';
SELECT is(enabled, true, 'feature flags are not writable via the API')
FROM public.feature_flags WHERE key = 'PHASE_1_CORE';

-- ---------------------------------------------------------------------------
-- 29-31: cross-org isolation for org admins
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('20202020-2020-2020-2020-202020202020', 'a1@example.com');

SELECT is(count(*)::int, 0, 'org admin cannot see another org batch members')
FROM public.batch_members
WHERE batch_id = '99990000-9999-9999-9999-999999999999';

UPDATE public.batch_members SET roll_number = 'X-HACK'
WHERE batch_id = '99990000-9999-9999-9999-999999999999';
-- The denied row is invisible to this admin by design; verify unchanged as owner.
RESET ROLE;
SELECT is(roll_number, 'R-001', 'org admin cannot change another org roll number')
FROM public.batch_members
WHERE batch_id = '99990000-9999-9999-9999-999999999999';

SELECT * FROM finish();
ROLLBACK;
