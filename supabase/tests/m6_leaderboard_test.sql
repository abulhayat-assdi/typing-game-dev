-- M6 pgTAP suite: batch leaderboard function (gated reads, windows,
-- ordering, isolation). Depends on bootstrap + 0001..0010 + dev seed.
-- Wrapped in BEGIN/ROLLBACK (rerunnable).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: L1/L2 in SALES-101, L3 in SALES-102, teacher T on SALES-101.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('c1c1c1c1-1111-1111-1111-111111111111', 'm6l1@example.com'),
  ('c2c2c2c2-2222-2222-2222-222222222222', 'm6l2@example.com'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'm6l3@example.com'),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'm6t@example.com');

INSERT INTO public.profiles (id, email, full_name, xp_total, current_level) VALUES
  ('c1c1c1c1-1111-1111-1111-111111111111', 'm6l1@example.com', 'Learner One', 150, 3),
  ('c2c2c2c2-2222-2222-2222-222222222222', 'm6l2@example.com', 'Learner Two', 80, 2),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'm6l3@example.com', 'Learner Three', 999, 9),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'm6t@example.com', 'Teacher T', 0, 1);

INSERT INTO public.user_roles (user_id, role) VALUES
  ('c1c1c1c1-1111-1111-1111-111111111111', 'student'),
  ('c2c2c2c2-2222-2222-2222-222222222222', 'student'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'student'),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'teacher');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'c1c1c1c1-1111-1111-1111-111111111111', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'c2c2c2c2-2222-2222-2222-222222222222', 'R-02', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'c3c3c3c3-3333-3333-3333-333333333333', 'R-01', 'beginner');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('c9c9c9c9-9999-9999-9999-999999999999',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Ledger: L1 +100 today / +50 ten days ago; L2 +80 today.
INSERT INTO public.xp_ledger
  (user_id, amount, source, reference_id, balance_after, created_at)
VALUES
  ('c1c1c1c1-1111-1111-1111-111111111111', 100, 'attempt', 'lb-a', 100, now()),
  ('c1c1c1c1-1111-1111-1111-111111111111', 50, 'attempt', 'lb-b', 150,
   now() - interval '10 days'),
  ('c2c2c2c2-2222-2222-2222-222222222222', 80, 'attempt', 'lb-c', 80, now());

-- Runs for averages (game/world/prompt scaffolding, then attempts+results).
INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('lb-world', 96, 'LB');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('lb-letters', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('d4d4d4d4-4444-4444-4444-444444444444', 'lb-game', 'lb-world',
   'test', 'target-press', 'letter', 'beginner', 'lb-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition) VALUES
  ('d4d4d4d4-4444-4444-4444-444444444444', 1, '{}');

INSERT INTO public.game_attempts
  (id, user_id, game_id, game_version_id, expected_text, status)
VALUES
  ('e1e1e1e1-1111-1111-1111-111111111111',
   'c1c1c1c1-1111-1111-1111-111111111111',
   'd4d4d4d4-4444-4444-4444-444444444444',
   (SELECT id FROM public.game_versions
    WHERE game_id = 'd4d4d4d4-4444-4444-4444-444444444444'),
   'abc', 'validated'),
  ('e2e2e2e2-2222-2222-2222-222222222222',
   'c2c2c2c2-2222-2222-2222-222222222222',
   'd4d4d4d4-4444-4444-4444-444444444444',
   (SELECT id FROM public.game_versions
    WHERE game_id = 'd4d4d4d4-4444-4444-4444-444444444444'),
   'abc', 'validated');

INSERT INTO public.attempt_results
  (attempt_id, raw, score, accuracy, effective_wpm, is_valid)
VALUES
  ('e1e1e1e1-1111-1111-1111-111111111111', '{}', 90, 95, 30, true),
  ('e2e2e2e2-2222-2222-2222-222222222222', '{}', 70, 90, 20, true);

INSERT INTO public.streaks (user_id, current_count, best_count, last_active_date) VALUES
  ('c1c1c1c1-1111-1111-1111-111111111111', 5, 9, CURRENT_DATE),
  ('c2c2c2c2-2222-2222-2222-222222222222', 2, 2, CURRENT_DATE);

INSERT INTO public.badge_awards (user_id, badge_id) VALUES
  ('c1c1c1c1-1111-1111-1111-111111111111', 'first-key'),
  ('c1c1c1c1-1111-1111-1111-111111111111', 'accuracy-ace');

SELECT plan(13);

SET ROLE authenticated;
SELECT tests.set_claims('c1c1c1c1-1111-1111-1111-111111111111', 'm6l1@example.com');

-- 1-2: member sees own batch, ordered with ranks.
SELECT is(count(*)::int, 2, 'member sees two batch-mates')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'today', 50);

SELECT results_eq(
  $$SELECT rank, full_name, roll_number
    FROM public.fn_batch_leaderboard(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'today', 50)$$,
  $$VALUES (1::bigint, 'Learner One'::text, 'R-01'::text),
           (2::bigint, 'Learner Two'::text, 'R-02'::text)$$,
  'ranks follow window XP with names and rolls'
);

-- 3-5: window sums and averages.
SELECT is(xp_window, 100, 'today window counts only recent XP')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'today', 50)
WHERE user_id = 'c1c1c1c1-1111-1111-1111-111111111111';

SELECT is(xp_window, 150, 'all-time window sums everything')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50)
WHERE user_id = 'c1c1c1c1-1111-1111-1111-111111111111';

SELECT results_eq(
  $$SELECT avg_wpm::int, avg_accuracy::int
    FROM public.fn_batch_leaderboard(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50)
    WHERE user_id = 'c1c1c1c1-1111-1111-1111-111111111111'$$,
  $$VALUES (30, 95)$$,
  'validated-run averages ride along'
);

-- 6-7: streak + badges payload.
SELECT is(streak_current, 5, 'current streak is batch-visible')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50)
WHERE user_id = 'c1c1c1c1-1111-1111-1111-111111111111';

SELECT is(jsonb_array_length(badges), 2, 'latest badges ride along')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50)
WHERE user_id = 'c1c1c1c1-1111-1111-1111-111111111111';

-- 8-10: isolation and guards.
SELECT tests.set_claims('c3c3c3c3-3333-3333-3333-333333333333', 'm6l3@example.com');
SELECT throws_ok(
  $$SELECT * FROM public.fn_batch_leaderboard(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50)$$,
  'P0001', 'NOT_MEMBER',
  'other-batch members cannot open this leaderboard'
);

SELECT tests.set_claims('c9c9c9c9-9999-9999-9999-999999999999', 'm6t@example.com');
SELECT is(count(*)::int, 2, 'assigned teacher can read the batch board')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50);

SELECT throws_ok(
  $$SELECT * FROM public.fn_batch_leaderboard(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'epoch', 50)$$,
  'P0001', 'INVALID_WINDOW',
  'unknown windows are rejected'
);

-- 11-12: limits and privilege hygiene.
SELECT is(count(*)::int, 1, 'limit clamps the board size')
FROM public.fn_batch_leaderboard(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 1);

SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.fn_batch_leaderboard(uuid, text, int)', 'EXECUTE'),
  'anonymous role cannot execute the leaderboard'
);

SELECT tests.clear_claims();
SELECT throws_ok(
  $$SELECT * FROM public.fn_batch_leaderboard(
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'all', 50)$$,
  'P0001', 'NOT_AUTHENTICATED',
  'sessionless calls are rejected'
);

SELECT * FROM finish();
ROLLBACK;
