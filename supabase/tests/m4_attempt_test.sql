-- M4 pgTAP suite: content catalog reads + attempt pipeline (start/submit/get,
-- ownership, expiry, double-finalize, immutability, RLS).
-- Wrapped in BEGIN/ROLLBACK (rerunnable). Depends on the M2 bootstrap
-- (auth stub + api roles) and migrations 0001..0007 + dev seed.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.worlds TO anon;
GRANT SELECT ON public.games TO anon;
GRANT SELECT ON public.scoring_profiles TO anon;
GRANT SELECT ON public.difficulty_profiles TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

-- Deterministic capture helpers (same pattern as the M2 suite).
CREATE OR REPLACE FUNCTION tests.attempt_start(
  p_slug text, p_diff text, p_seed text, p_expected text
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT public.fn_start_attempt(p_slug, p_diff, p_seed, p_expected, 900) INTO v_id;
  RETURN 'OK:' || v_id::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION tests.attempt_submit(
  p_attempt uuid, p_score numeric, p_acc numeric, p_wpm numeric,
  p_valid boolean, p_reason text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_status public.attempt_status;
BEGIN
  SELECT public.fn_submit_attempt(
    p_attempt, '{"typed":10}'::jsonb, p_score, p_acc, p_wpm, p_valid, p_reason
  ) INTO v_status;
  RETURN 'OK:' || v_status::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION tests.attempt_insert_direct(p_game uuid, p_version uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.game_attempts
    (user_id, game_id, game_version_id, expected_text)
  VALUES
    (auth.uid(), p_game, p_version, 'direct');
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (superuser bypasses RLS; policies are tested below as roles).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-2222-3333-4444-555555555555', 'm4u1@example.com'),
  ('66666666-7777-8888-9999-000000000000', 'm4u2@example.com');

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('11111111-2222-3333-4444-555555555555', 'm4u1@example.com', 'M4 User One'),
  ('66666666-7777-8888-9999-000000000000', 'm4u2@example.com', 'M4 User Two');

INSERT INTO public.worlds (id, sort_order, name_en, name_bn) VALUES
  ('test-world', 99, 'Test World', 'পরীক্ষা বিশ্ব');

INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('test-letters', 1, 'letters', 'en', '["a","b","c"]');

INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty, skill_bands,
   prompt_set_ref, prompt_units, scoring_profile_id, is_active, current_version)
VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', 'test-game', 'test-world',
   'test', 'target-press', 'letter', 'beginner', ARRAY['beginner'],
   'test-letters', 10, 'standard', true, 1),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'retired-game', 'test-world',
   'test', 'target-press', 'letter', 'beginner', ARRAY['beginner'],
   'test-letters', 10, 'standard', false, 1);

INSERT INTO public.game_versions (game_id, version, definition) VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', 1, '{"slug":"test-game"}'),
  ('bbbbbbbb-2222-2222-2222-222222222222', 1, '{"slug":"retired-game"}');

SELECT plan(27);

-- ---------------------------------------------------------------------------
-- 1-5: start path
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT tests.set_claims('11111111-2222-3333-4444-555555555555', 'm4u1@example.com');

SELECT matches(
  tests.attempt_start('test-game', 'beginner', 's1', 'P1'),
  '^OK:',
  'authenticated start binds an attempt'
);

SELECT is(status, 'started', 'new attempt starts in started state')
FROM public.game_attempts WHERE expected_text = 'P1';

SELECT matches(
  tests.attempt_start('no-such-game', 'beginner', 's', 'Px'),
  'GAME_NOT_FOUND',
  'unknown game slug is rejected'
);

SELECT matches(
  tests.attempt_start('retired-game', 'beginner', 's', 'Px'),
  'GAME_NOT_FOUND',
  'inactive game is rejected'
);

SELECT tests.clear_claims();
SELECT matches(
  tests.attempt_start('test-game', 'beginner', 's', 'Px'),
  'NOT_AUTHENTICATED',
  'start without a session is rejected'
);

SELECT tests.set_claims('11111111-2222-3333-4444-555555555555', 'm4u1@example.com');
SELECT tests.attempt_start('test-game', 'beginner', 's2', 'P2');
SELECT tests.attempt_start('test-game', 'beginner', 's3', 'P3');
SELECT tests.attempt_start('test-game', 'beginner', 's4', 'P4');
SELECT tests.attempt_start('test-game', 'beginner', 's5', 'P5');
SELECT matches(
  tests.attempt_start('test-game', 'beginner', 's6', 'P6'),
  'TOO_MANY_ACTIVE',
  'concurrent live attempts are capped'
);

-- ---------------------------------------------------------------------------
-- 6-9: attempt RLS
-- ---------------------------------------------------------------------------
SELECT is(count(*)::int, 5, 'owner reads their own attempts')
FROM public.game_attempts
WHERE user_id = '11111111-2222-3333-4444-555555555555';

SELECT tests.set_claims('66666666-7777-8888-9999-000000000000', 'm4u2@example.com');
SELECT is(count(*)::int, 0, 'users cannot read other users attempts')
FROM public.game_attempts
WHERE user_id = '11111111-2222-3333-4444-555555555555';

SELECT matches(
  tests.attempt_insert_direct(
    'aaaaaaaa-1111-1111-1111-111111111111',
    (SELECT id FROM public.game_versions
     WHERE game_id = 'aaaaaaaa-1111-1111-1111-111111111111')),
  '^ERR:42501',
  'direct attempt insert is denied by RLS'
);

SELECT tests.set_claims('11111111-2222-3333-4444-555555555555', 'm4u1@example.com');
UPDATE public.game_attempts SET status = 'abandoned' WHERE expected_text = 'P1';
SELECT is(status, 'started', 'direct status update is denied by RLS')
FROM public.game_attempts WHERE expected_text = 'P1';

-- ---------------------------------------------------------------------------
-- 10-16: submit path
-- ---------------------------------------------------------------------------
SELECT matches(
  tests.attempt_submit(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'P1'),
    123.45, 95, 19, true),
  '^OK:validated',
  'valid submission finalizes the attempt'
);

SELECT is(score, 123.45, 'server-computed score is persisted')
FROM public.attempt_results
WHERE attempt_id = (SELECT id FROM public.game_attempts WHERE expected_text = 'P1');

SELECT tests.set_claims('66666666-7777-8888-9999-000000000000', 'm4u2@example.com');
SELECT is(count(*)::int, 0, 'results of others are invisible')
FROM public.attempt_results;

SELECT tests.set_claims('11111111-2222-3333-4444-555555555555', 'm4u1@example.com');
SELECT matches(
  tests.attempt_submit(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'P1'),
    1, 1, 1, true),
  'ALREADY_FINALIZED',
  'duplicate finalization is rejected'
);

SELECT tests.set_claims('66666666-7777-8888-9999-000000000000', 'm4u2@example.com');
SELECT matches(
  tests.attempt_submit(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'P2'),
    1, 1, 1, true),
  'ATTEMPT_NOT_FOUND',
  'blind cross-user submission finds nothing (IDOR-safe)'
);

-- Same attack with a leaked UUID must fail ownership, not silently pass.
RESET ROLE;
SELECT id AS p2id FROM public.game_attempts WHERE expected_text = 'P2' \gset
SET ROLE authenticated;
SELECT tests.set_claims('66666666-7777-8888-9999-000000000000', 'm4u2@example.com');
SELECT matches(
  tests.attempt_submit(:'p2id', 1, 1, 1, true),
  'NOT_OWNER',
  'known-id cross-user submission is rejected'
);

RESET ROLE;
INSERT INTO public.game_attempts
  (user_id, game_id, game_version_id, prompt_seed, expected_text,
   difficulty, status, expires_at)
VALUES
  ('11111111-2222-3333-4444-555555555555',
   'aaaaaaaa-1111-1111-1111-111111111111',
   (SELECT id FROM public.game_versions
    WHERE game_id = 'aaaaaaaa-1111-1111-1111-111111111111'),
   'sx', 'PX', 'beginner', 'started', now() - interval '1 hour');

SET ROLE authenticated;
SELECT tests.set_claims('11111111-2222-3333-4444-555555555555', 'm4u1@example.com');
SELECT matches(
  tests.attempt_submit(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'PX'),
    1, 1, 1, true),
  'ATTEMPT_EXPIRED',
  'expired attempts cannot finalize'
);
SELECT is(status, 'started', 'expired attempts stay unfinalized, never validated')
FROM public.game_attempts WHERE expected_text = 'PX';

SELECT matches(
  tests.attempt_submit(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'P3'),
    10, 40, 8, false, 'FORGED_WPM'),
  '^OK:rejected',
  'failed validation persists a rejection'
);
SELECT is(is_valid, false, 'rejection stores the invalid verdict')
FROM public.attempt_results
WHERE attempt_id = (SELECT id FROM public.game_attempts WHERE expected_text = 'P3');
SELECT is(rejected_reason, 'FORGED_WPM', 'rejection reason is preserved')
FROM public.attempt_results
WHERE attempt_id = (SELECT id FROM public.game_attempts WHERE expected_text = 'P3');

UPDATE public.attempt_results SET score = 999999
WHERE attempt_id = (SELECT id FROM public.game_attempts WHERE expected_text = 'P1');
SELECT is(score, 123.45, 'validated results are immutable via the API')
FROM public.attempt_results
WHERE attempt_id = (SELECT id FROM public.game_attempts WHERE expected_text = 'P1');

-- ---------------------------------------------------------------------------
-- 17-20: catalog reads (metadata public, answers never)
-- ---------------------------------------------------------------------------
RESET ROLE;
SET ROLE anon;
SELECT is(count(*)::int, 1, 'anonymous clients see active games only')
FROM public.games;

SELECT is(count(*)::int, 0, 'retired games are hidden')
FROM public.games WHERE slug = 'retired-game';

RESET ROLE;
SET ROLE authenticated;
SELECT tests.set_claims('11111111-2222-3333-4444-555555555555', 'm4u1@example.com');
SELECT is(count(*)::int, 0, 'prompt sets are never readable via the API')
FROM public.prompt_sets;

SELECT is(count(*)::int, 1, 'versions of active games are auditable')
FROM public.game_versions
WHERE game_id = 'aaaaaaaa-1111-1111-1111-111111111111';

SELECT is(count(*)::int, 0, 'versions of retired games are hidden')
FROM public.game_versions
WHERE game_id = 'bbbbbbbb-2222-2222-2222-222222222222';

SELECT * FROM finish();
ROLLBACK;
