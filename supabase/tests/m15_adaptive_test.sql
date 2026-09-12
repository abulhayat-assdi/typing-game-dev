-- M15 pgTAP suite: adaptive evidence ingest, skill dimensions,
-- key/finger analysis, trends, recommendations, difficulty, feedback,
-- staff aggregates, privacy. BEGIN/ROLLBACK.
--
-- Harness order: bootstrap → migrations → seed (batches) → this file.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('f1f1f1f1-0000-0000-0000-000000000001', 'a15a@example.com'),
  ('f1f1f1f1-0000-0000-0000-000000000002', 'a15t@example.com'),
  ('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com'),
  ('f1f1f1f1-0000-0000-0000-000000000004', 'a15s2@example.com'),
  ('f1f1f1f1-0000-0000-0000-000000000005', 'a15x@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('f1f1f1f1-0000-0000-0000-000000000001', 'a15a@example.com', 'Admin', 'UTC'),
  ('f1f1f1f1-0000-0000-0000-000000000002', 'a15t@example.com', 'Teacher', 'UTC'),
  ('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com', 'Student One', 'UTC'),
  ('f1f1f1f1-0000-0000-0000-000000000004', 'a15s2@example.com', 'Student Two', 'UTC'),
  ('f1f1f1f1-0000-0000-0000-000000000005', 'a15x@example.com', 'Outsider', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f1f1f1f1-0000-0000-0000-000000000001', 'super_admin'),
  ('f1f1f1f1-0000-0000-0000-000000000002', 'teacher'),
  ('f1f1f1f1-0000-0000-0000-000000000003', 'student'),
  ('f1f1f1f1-0000-0000-0000-000000000004', 'student'),
  ('f1f1f1f1-0000-0000-0000-000000000005', 'student');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('f1f1f1f1-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'f1f1f1f1-0000-0000-0000-000000000003', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'f1f1f1f1-0000-0000-0000-000000000004', 'R-02', 'beginner');

-- Catalog fixtures (service-role equivalent: owner bypasses RLS).
RESET ROLE;
INSERT INTO public.worlds (id, sort_order, name_en) VALUES
  ('a15-world', 900, 'A15 World')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.prompt_sets (ref, kind, items) VALUES
  ('a15-letters', 'letters', '["a","p","o"]'::jsonb),
  ('a15-words', 'words', '["pop","open","top"]'::jsonb)
ON CONFLICT (ref) DO NOTHING;
INSERT INTO public.games
  (slug, world_id, category, mechanic, mode, difficulty, prompt_set_ref,
   scoring_profile_id, unlock_rule, is_active)
VALUES
  ('a15-letters', 'a15-world', 'drill', 'word', 'standard', 'beginner',
   'a15-letters', 'standard', '{"type":"open"}', true),
  ('a15-words', 'a15-world', 'drill', 'race', 'standard', 'beginner',
   'a15-words', 'standard', '{"type":"open"}', true),
  ('a15-locked', 'a15-world', 'drill', 'race', 'standard', 'expert',
   'a15-words', 'standard', '{"type":"min_level","level":99}', true)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.game_versions (game_id, version, definition)
SELECT g.id, 1, '{"v":1}'::jsonb FROM public.games g
WHERE g.slug IN ('a15-letters', 'a15-words', 'a15-locked')
ON CONFLICT (game_id, version) DO NOTHING;
UPDATE public.games SET current_version = 1
WHERE slug IN ('a15-letters', 'a15-words', 'a15-locked');

SELECT plan(46);

SET ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Pure maps: fingers + pair classes.
-- ---------------------------------------------------------------------------
SELECT is(public.adaptive_finger_for('a'), 'left_pinky', 'a is left pinky');
SELECT is(public.adaptive_finger_for('p'), 'right_pinky', 'p is right pinky');
SELECT is(public.adaptive_finger_for(' '), 'left_thumb', 'space is left thumb');
SELECT is(public.adaptive_finger_for('€'), NULL, 'unknown keys unmapped');
SELECT is(public.adaptive_classify_pair('o', 'p'), 'letter_confusion', 'o/p is letter confusion');
SELECT is(public.adaptive_classify_pair('P', 'p'), 'capitalization', 'case slip is capitalization');
SELECT is(public.adaptive_classify_pair('5', '%'), 'number_row', 'digit slip is number row');
SELECT is(public.adaptive_classify_pair(',', 'm'), 'punctuation', 'comma slip is punctuation');

-- ---------------------------------------------------------------------------
-- Evidence ingest through the real attempt path (one validated attempt).
-- expected 'pop open top pop' (16 chars) vs two o-misses.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_start_attempt('a15-words', 'beginner', 'seed-1', 'pop open top pop', 900)$$,
  'attempt starts on an active game');
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts
   WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
   ORDER BY created_at DESC LIMIT 1),
  '{"completion": 100, "errorStrokes": 2, "incorrectCharacters": 2, "correctedCharacters": 0, "durationMs": 20000}'::jsonb,
  10, 80, 12, true);
SELECT is(
  public.fn_record_adaptive_attempt(
    (SELECT id FROM public.game_attempts
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
     ORDER BY created_at DESC LIMIT 1),
    '[{"key":"p","exposures":5,"errors":0},{"key":"o","exposures":5,"errors":2},{"key":" ","exposures":3,"errors":0},{"key":"e","exposures":1,"errors":0},{"key":"n","exposures":1,"errors":0},{"key":"t","exposures":1,"errors":0}]'::jsonb,
    '[{"expected":"o","actual":"q","count":1}]'::jsonb),
  true, 'validated attempt records adaptive evidence');
SELECT is(
  public.fn_record_adaptive_attempt(
    (SELECT id FROM public.game_attempts
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
     ORDER BY created_at DESC LIMIT 1),
    '[{"key":"p","exposures":5,"errors":0},{"key":"o","exposures":5,"errors":2},{"key":" ","exposures":3,"errors":0},{"key":"e","exposures":1,"errors":0},{"key":"n","exposures":1,"errors":0},{"key":"t","exposures":1,"errors":0}]'::jsonb,
    '[]'::jsonb),
  false, 'repeat delivery is a no-op');
SELECT throws_ok(
  $$SELECT public.fn_record_adaptive_attempt(
    (SELECT id FROM public.game_attempts
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
     ORDER BY created_at DESC LIMIT 1),
    '[{"key":"p","exposures":9,"errors":0}]'::jsonb, '[]'::jsonb)$$,
  'P0001', 'MALFORMED',
  'forged exposure totals rejected');
SELECT throws_ok(
  $$SELECT public.fn_record_adaptive_attempt(
    '00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb, '[]'::jsonb)$$,
  'P0001', 'NOT_FOUND',
  'forged attempt IDs rejected');
SELECT is(count(*)::int, 1, 'one sample stored')
FROM public.adaptive_attempt_samples
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003';
SELECT is(errors, 2, 'o errors counted')
FROM public.adaptive_key_stats
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003' AND key_char = 'o';
SELECT is(pair_class, 'letter_confusion', 'pair class stored')
FROM public.adaptive_error_pairs
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND expected_char = 'o' AND actual_char = 'q';

-- Two more validated attempts so dimension evidence reaches thresholds.
RESET ROLE;
INSERT INTO public.game_attempts
  (user_id, game_id, game_version_id, prompt_seed, expected_text,
   difficulty, status, submitted_at, finalized_at)
SELECT 'f1f1f1f1-0000-0000-0000-000000000003', g.id, gv.id,
       'early-' || gs.n, 'pop open top pop',
       'beginner', 'validated',
       now() - ((3 - gs.n) || ' hours')::interval,
       now() - ((3 - gs.n) || ' hours')::interval
FROM (SELECT generate_series(1, 2) AS n) AS gs
CROSS JOIN (SELECT id FROM public.games WHERE slug = 'a15-words') AS g
CROSS JOIN (SELECT id FROM public.game_versions
            WHERE game_id = (SELECT id FROM public.games WHERE slug = 'a15-words')
            ORDER BY version DESC LIMIT 1) AS gv;
INSERT INTO public.attempt_results
  (attempt_id, raw, score, accuracy, effective_wpm, is_valid)
SELECT a.id,
  jsonb_build_object('completion', 100, 'errorStrokes', 1,
    'incorrectCharacters', 1, 'correctedCharacters', 0, 'durationMs', 20000),
  10, 82, 14, true
FROM public.game_attempts a
WHERE a.prompt_seed LIKE 'early-%';
SET ROLE authenticated;
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com');
SELECT lives_ok(
  $$SELECT count(public.fn_record_adaptive_attempt(
    a.id,
    '[{"key":"p","exposures":5,"errors":0},{"key":"o","exposures":5,"errors":1},{"key":" ","exposures":3,"errors":0},{"key":"e","exposures":1,"errors":0},{"key":"n","exposures":1,"errors":0},{"key":"t","exposures":1,"errors":0}]'::jsonb,
    '[]'::jsonb))
  FROM public.game_attempts a
  WHERE a.prompt_seed LIKE 'early-%'$$,
  'early evidence records');
SELECT public.fn_start_attempt('a15-words', 'beginner', 'seed-2', 'pop', 900);
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts
   WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
     AND prompt_seed = 'seed-2'),
  '{"completion": 0, "errorStrokes": 0, "correctedCharacters": 0, "durationMs": 100}'::jsonb,
  0, 0, 0, false, 'CHEAT');
SELECT throws_ok(
  $$SELECT public.fn_record_adaptive_attempt(
    (SELECT id FROM public.game_attempts
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
       AND prompt_seed = 'seed-2'),
    '[{"key":"p","exposures":2,"errors":0},{"key":"o","exposures":1,"errors":0}]'::jsonb,
    '[]'::jsonb)$$,
  'P0001', 'INVALID_STATE',
  'rejected attempts rejected');

-- ---------------------------------------------------------------------------
-- Refresh: dimensions, fingers, weaknesses, band, recommendations.
-- ---------------------------------------------------------------------------
SELECT ok(
  (public.fn_refresh_adaptive_profile() ->> 'recommendations')::int >= 1,
  'refresh yields recommendations');
SELECT is(practice_band, 'beginner', 'new learner banded beginner')
FROM public.learner_skill_profiles
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003';
SELECT ok(count(*)::int >= 1, 'weaknesses materialized')
FROM public.adaptive_weaknesses
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003';
SELECT ok(score > 0, 'o weakness scored above zero')
FROM public.adaptive_weaknesses
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND target_type = 'key' AND target = 'o';
SELECT is(finger, 'right_ring', 'o aggregates to right ring')
FROM public.adaptive_finger_stats
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
ORDER BY errors DESC LIMIT 1;
SELECT is(trend, 'insufficient', 'single sample cannot trend')
FROM public.adaptive_skill_trends
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND metric = 'accuracy';
SELECT ok(
  (SELECT count(*)::int FROM public.adaptive_recommendations
   WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
     AND status = 'active'
     AND game_slug = 'a15-locked') = 0,
  'locked games never recommended');
SELECT ok(message !~* 'bad|fail|wrong',
  'recommendation language stays positive')
FROM public.adaptive_recommendations
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND status = 'active' LIMIT 1;

-- Summary serves the cached profile cheaply.
SELECT ok(
  (public.fn_get_adaptive_summary() -> 'recommendations') IS NOT NULL,
  'summary serves recommendations');
SELECT ok(
  jsonb_array_length(public.fn_get_adaptive_summary() -> 'weaknesses') >= 1,
  'summary serves weaknesses');

-- ---------------------------------------------------------------------------
-- Volume: declining accuracy across 16 attempts → declining trend.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.game_attempts
  (user_id, game_id, game_version_id, prompt_seed, expected_text,
   difficulty, status, submitted_at, finalized_at)
SELECT 'f1f1f1f1-0000-0000-0000-000000000003', g.id, gv.id,
       'bulk-' || gs.n, 'pop open top',
       'beginner', 'validated',
       now() - ((17 - gs.n) || ' minutes')::interval,
       now() - ((17 - gs.n) || ' minutes')::interval
FROM (SELECT generate_series(1, 16) AS n) AS gs
CROSS JOIN (SELECT id FROM public.games WHERE slug = 'a15-words') AS g
CROSS JOIN (SELECT id FROM public.game_versions
            WHERE game_id = (SELECT id FROM public.games WHERE slug = 'a15-words')
            ORDER BY version DESC LIMIT 1) AS gv;
INSERT INTO public.attempt_results
  (attempt_id, raw, score, accuracy, effective_wpm, is_valid)
SELECT a.id,
  jsonb_build_object('completion', 100, 'errorStrokes', gs.n,
    'correctedCharacters', 0, 'durationMs', 30000),
  10, GREATEST(95 - gs.n, 40), 20, true
FROM public.game_attempts a
JOIN (SELECT generate_series(1, 16) AS n) AS gs
  ON a.prompt_seed = 'bulk-' || gs.n;
SET ROLE authenticated;
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com');
SELECT lives_ok(
  $$SELECT count(public.fn_record_adaptive_attempt(
    a.id,
    (SELECT jsonb_agg(jsonb_build_object('key', ch, 'exposures', 1, 'errors', 0))
     FROM (SELECT unnest(string_to_array(a.expected_text, NULL)) AS ch) AS u),
    '[]'::jsonb))
  FROM public.game_attempts a
  WHERE a.prompt_seed LIKE 'bulk-%'$$,
  'bulk evidence records');
SELECT public.fn_refresh_adaptive_profile();
SELECT is(trend, 'declining', 'sustained slide trends declining')
FROM public.adaptive_skill_trends
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND metric = 'accuracy';

-- ---------------------------------------------------------------------------
-- Difficulty: mastery on letters promotes within safety bounds.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.game_attempts
  (user_id, game_id, game_version_id, prompt_seed, expected_text,
   difficulty, status, submitted_at, finalized_at)
SELECT 'f1f1f1f1-0000-0000-0000-000000000003', g.id, gv.id,
       'mast-' || gs.n, 'apo',
       'beginner', 'validated', now(), now()
FROM (SELECT generate_series(1, 3) AS n) AS gs
CROSS JOIN (SELECT id FROM public.games WHERE slug = 'a15-letters') AS g
CROSS JOIN (SELECT id FROM public.game_versions
            WHERE game_id = (SELECT id FROM public.games WHERE slug = 'a15-letters')
            ORDER BY version DESC LIMIT 1) AS gv;
INSERT INTO public.attempt_results
  (attempt_id, raw, score, accuracy, effective_wpm, is_valid)
SELECT a.id,
  jsonb_build_object('completion', 100, 'errorStrokes', 0,
    'correctedCharacters', 0, 'durationMs', 5000),
  30, 99, 40, true
FROM public.game_attempts a
WHERE a.prompt_seed LIKE 'mast-%';
SET ROLE authenticated;
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com');
SELECT lives_ok(
  $$SELECT count(public.fn_record_adaptive_attempt(
    a.id,
    (SELECT jsonb_agg(jsonb_build_object('key', ch, 'exposures', 1, 'errors', 0))
     FROM (SELECT DISTINCT ch FROM (
       SELECT unnest(string_to_array(a.expected_text, NULL)) AS ch) AS u) AS u2),
    '[]'::jsonb))
  FROM public.game_attempts a
  WHERE a.prompt_seed LIKE 'mast-%'$$,
  'mastery evidence records');
SELECT public.fn_refresh_adaptive_profile();
SELECT is(band, 'intermediate', 'mastery promotes one band')
FROM public.adaptive_game_difficulty
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND game_slug = 'a15-letters';

-- ---------------------------------------------------------------------------
-- Feedback + fatigue.
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.fn_adaptive_feedback(
    (SELECT id FROM public.adaptive_recommendations
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
       AND status = 'active' ORDER BY rank LIMIT 1),
    'started')$$,
  'started feedback accepted');
SELECT is(status, 'accepted', 'started marks accepted')
FROM public.adaptive_recommendations
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND status = 'accepted' LIMIT 1;
SELECT lives_ok(
  $$SELECT public.fn_adaptive_feedback(
    (SELECT id FROM public.adaptive_recommendations
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
       AND status = 'accepted' LIMIT 1),
    'completed')$$,
  'completed feedback accepted');
SELECT throws_ok(
  $$SELECT public.fn_adaptive_feedback(
    (SELECT id FROM public.adaptive_recommendations
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003' LIMIT 1),
    'hacked')$$,
  'P0001', 'MALFORMED',
  'score manipulation rejected');
SELECT ok(count(*)::int >= 1, 'exposure tracked for fatigue control')
FROM public.adaptive_exposure
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Mission integration: today's assigned daily surfaces when relevant.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.missions
  (slug, title, category, status, objective_type, target, game_constraints)
VALUES ('a15-daily', 'A15 Daily', 'DAILY', 'active', 'GAMES_COMPLETED',
  '{"count": 1}'::jsonb, '{"games": ["a15-words"]}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.mission_instances
  (mission_id, user_id, period, period_start, status)
SELECT id, 'f1f1f1f1-0000-0000-0000-000000000003', 'daily', CURRENT_DATE, 'active'
FROM public.missions WHERE slug = 'a15-daily'
ON CONFLICT (mission_id, user_id, period_start) DO NOTHING;
INSERT INTO public.daily_mission_assignments (user_id, day, mission_id, instance_id)
SELECT 'f1f1f1f1-0000-0000-0000-000000000003', CURRENT_DATE, m.id, i.id
FROM public.missions m
JOIN public.mission_instances i ON i.mission_id = m.id
  AND i.user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND i.period_start = CURRENT_DATE
WHERE m.slug = 'a15-daily'
ON CONFLICT (user_id, day, mission_id) DO NOTHING;
SET ROLE authenticated;
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000003', 'a15s1@example.com');
SELECT public.fn_refresh_adaptive_profile();
SELECT ok(count(*)::int >= 1, 'daily mission recommendation surfaces')
FROM public.adaptive_recommendations
WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003'
  AND status = 'active' AND reason_code = 'DAILY_MISSION';

-- ---------------------------------------------------------------------------
-- Privacy + staff scope.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000004', 'a15s2@example.com');
SELECT is(count(*)::int, 0, 'students cannot read another learner key evidence')
FROM public.adaptive_key_stats;
SELECT ok(
  jsonb_array_length(public.fn_get_adaptive_summary() -> 'weaknesses') = 0,
  'fresh learner has no weaknesses');
SELECT throws_ok(
  $$SELECT public.fn_adaptive_feedback(
    (SELECT id FROM public.adaptive_recommendations
     WHERE user_id = 'f1f1f1f1-0000-0000-0000-000000000003' LIMIT 1),
    'skipped')$$,
  'P0001', 'NOT_FOUND',
  'cross-user feedback rejected');
SELECT throws_ok(
  $$SELECT public.fn_adaptive_global_summary()$$,
  'P0001', 'FORBIDDEN',
  'students cannot see global aggregates');
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000002', 'a15t@example.com');
SELECT ok(
  (public.fn_adaptive_batch_summary(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'attention') IS NOT NULL,
  'teacher sees batch attention flags');
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000005', 'a15x@example.com');
SELECT throws_ok(
  $$SELECT public.fn_adaptive_batch_summary(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'FORBIDDEN',
  'outsiders cannot see batch aggregates');
SELECT tests.set_claims('f1f1f1f1-0000-0000-0000-000000000001', 'a15a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_adaptive_global_summary()$$,
  'admin sees global aggregates');
SELECT lives_ok(
  $$SELECT public.fn_adaptive_sweep()$$,
  'scheduler sweep runs');

SELECT * FROM finish();
ROLLBACK;
