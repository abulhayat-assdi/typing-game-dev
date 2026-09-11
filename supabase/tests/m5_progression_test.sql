-- M5 pgTAP suite: progression pipeline (ledgers, levels, badges,
-- achievements, streaks, records, unlocks, idempotency, RLS).
-- Depends on the M2 bootstrap + migrations 0001..0009 + dev seed.
-- Attempts are addressed by distinct expected_text (no psql variables).
-- Wrapped in BEGIN/ROLLBACK (rerunnable).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.worlds TO anon;
GRANT SELECT ON public.games TO anon;
GRANT SELECT ON public.levels TO anon;
GRANT SELECT ON public.badges TO anon;
GRANT SELECT ON public.achievements TO anon;
GRANT SELECT ON public.scoring_profiles TO anon;
GRANT SELECT ON public.difficulty_profiles TO anon;
GRANT SELECT ON public.reward_profiles TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

CREATE OR REPLACE FUNCTION tests.process_attempt(p_attempt uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_out jsonb;
BEGIN
  SELECT public.fn_process_progression(p_attempt) INTO v_out;
  RETURN 'OK:' || v_out::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION tests.ledger_insert()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.xp_ledger
    (user_id, amount, source, reference_id, balance_after)
  VALUES (auth.uid(), 5, 'hack', 'hack-1', 5);
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (superuser bypasses RLS; policies tested below as roles).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a1a1a1a1-1111-1111-1111-111111111111', 'm5u1@example.com'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'm5u2@example.com');

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('a1a1a1a1-1111-1111-1111-111111111111', 'm5u1@example.com', 'M5 User One'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'm5u2@example.com', 'M5 User Two');

INSERT INTO public.worlds (id, sort_order, name_en, name_bn) VALUES
  ('m5-world', 98, 'M5 World', 'এম৫ বিশ্ব');

INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('m5-letters', 1, 'letters', 'en', '["a","b","c"]');

INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty, skill_bands,
   prompt_set_ref, prompt_units, scoring_profile_id, is_active, current_version)
VALUES
  ('c3c3c3c3-3333-3333-3333-333333333333', 'm5-game', 'm5-world',
   'test', 'target-press', 'letter', 'beginner', ARRAY['beginner'],
   'm5-letters', 10, 'standard', true, 1);

INSERT INTO public.game_versions (game_id, version, definition) VALUES
  ('c3c3c3c3-3333-3333-3333-333333333333', 1, '{"slug":"m5-game"}');

SELECT plan(29);

SET ROLE authenticated;
SELECT tests.set_claims('a1a1a1a1-1111-1111-1111-111111111111', 'm5u1@example.com');

-- First validated attempt: acc 96, wpm 20, score 100.
-- XP = 10 base + 20 first + 15 PB + 10 accuracy = 55; coins = 2 + 5 = 7.
SELECT public.fn_start_attempt('m5-game', 'beginner', 'm5s1', 'M5A1', 900);
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A1'),
  '{"totalCharacters":1500,"completedWords":300,"incorrectCharacters":60,"completion":100,"durationMs":60000}'::jsonb,
  100, 96, 20, true);

-- 1: summary carries the computed awards.
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A1')),
  '"xp": 55, "coins": 7',
  'first processing grants 55 XP and 7 coins'
);

-- 2: cached balances + level.
SELECT results_eq(
  $$SELECT xp_total, coin_balance, current_level FROM public.profiles
    WHERE id = 'a1a1a1a1-1111-1111-1111-111111111111'$$,
  $$VALUES (55, 7, 2)$$,
  'cached balances updated, level 2 reached'
);

-- 3: ledger row shape.
SELECT results_eq(
  $$SELECT amount, balance_after FROM public.xp_ledger
    WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'$$,
  $$VALUES (55, 55)$$,
  'xp ledger row carries amount and balance_after'
);
SELECT matches(
  (SELECT reference_id FROM public.xp_ledger
   WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  '^attempt:.*:progression:v1$',
  'ledger reference is the idempotency key'
);

-- 4-5: duplicate processing is a safe no-op.
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A1')),
  'already_processed.: true',
  'reprocessing returns already_processed'
);
SELECT results_eq(
  $$SELECT (SELECT count(*)::int FROM public.xp_ledger
            WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
           (SELECT xp_total FROM public.profiles
            WHERE id = 'a1a1a1a1-1111-1111-1111-111111111111')$$,
  $$VALUES (1, 55)$$,
  'no duplicate ledger rows or balances on reprocess'
);

-- 6-9: only VALIDATED attempts process.
SELECT public.fn_start_attempt('m5-game', 'beginner', 'm5s2', 'M5A2', 900);
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A2'),
  '{"totalCharacters":10}'::jsonb, 5, 50, 5, false, 'FORGED_WPM');
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A2')),
  'NOT_VALIDATED',
  'rejected attempts cannot process'
);

SELECT public.fn_start_attempt('m5-game', 'beginner', 'm5s3', 'M5A3', 900);
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A3')),
  'NOT_VALIDATED',
  'started attempts cannot process'
);

SELECT tests.clear_claims();
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A1')),
  'NOT_AUTHENTICATED',
  'processing without a session is rejected'
);

-- Owner check needs the real id: look it up as owner (bypasses RLS) while
-- keeping u2's claims, so the function itself must reject ownership.
RESET ROLE;
SELECT tests.set_claims('b2b2b2b2-2222-2222-2222-222222222222', 'm5u2@example.com');
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A1')),
  'NOT_OWNER',
  'processing another user attempt is rejected'
);
SET ROLE authenticated;

-- 10: second (worse) attempt earns base only; totals accumulate.
SELECT tests.set_claims('a1a1a1a1-1111-1111-1111-111111111111', 'm5u1@example.com');
SELECT public.fn_start_attempt('m5-game', 'beginner', 'm5s4', 'M5A4', 900);
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A4'),
  '{"totalCharacters":50,"completedWords":10,"incorrectCharacters":10,"completion":100,"durationMs":60000}'::jsonb,
  50, 80, 10, true);
SELECT matches(
  tests.process_attempt(
    (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A4')),
  '"xp": 10',
  'repeat run earns base XP only'
);
SELECT is(xp_total, 65, 'balances accumulate across runs')
FROM public.profiles
WHERE id = 'a1a1a1a1-1111-1111-1111-111111111111';

-- 11-13: ledger RLS.
SELECT matches(
  tests.ledger_insert(),
  '^ERR:42501',
  'direct ledger inserts are denied by RLS'
);

SELECT tests.set_claims('b2b2b2b2-2222-2222-2222-222222222222', 'm5u2@example.com');
SELECT is(count(*)::int, 0, 'ledgers of others are invisible')
FROM public.xp_ledger
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111';

SELECT tests.set_claims('a1a1a1a1-1111-1111-1111-111111111111', 'm5u1@example.com');
UPDATE public.profiles SET xp_total = 999999
WHERE id = 'a1a1a1a1-1111-1111-1111-111111111111';
SELECT is(xp_total, 65, 'cached balances cannot be written via the API')
FROM public.profiles
WHERE id = 'a1a1a1a1-1111-1111-1111-111111111111';

-- 14: two more small runs cross level 3 (65 + 10 + 10 = 85).
SELECT public.fn_start_attempt('m5-game', 'beginner', 'm5s5', 'M5A5', 900);
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A5'),
  '{"totalCharacters":50}'::jsonb, 5, 80, 10, true);
SELECT tests.process_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A5'));
SELECT public.fn_start_attempt('m5-game', 'beginner', 'm5s6', 'M5A6', 900);
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A6'),
  '{"totalCharacters":50}'::jsonb, 5, 80, 10, true);
SELECT tests.process_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M5A6'));
SELECT is(current_level, 3, 'crossing 80 XP reaches level 3, never downgrades')
FROM public.profiles
WHERE id = 'a1a1a1a1-1111-1111-1111-111111111111';

-- 15-18: badges.
SELECT is(count(*)::int, 1, 'first-key awarded on debut')
FROM public.badge_awards
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111' AND badge_id = 'first-key';

SELECT is(count(*)::int, 1, 'accuracy-ace awarded at 96%')
FROM public.badge_awards
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111' AND badge_id = 'accuracy-ace';

SELECT is(count(*)::int, 0, 'wpm-60 stays locked at 20 WPM')
FROM public.badge_awards
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111' AND badge_id = 'wpm-60';

SELECT is(count(*)::int, 1, 'hundred-words awarded at 300 lifetime words')
FROM public.badge_awards
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111' AND badge_id = 'hundred-words';

-- 19: achievements.
SELECT is(count(*)::int, 1, 'chars-1k achievement recorded')
FROM public.achievement_awards
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
  AND achievement_id = 'chars-1k';

-- 20-21: streaks (all runs share one activity day here).
SELECT results_eq(
  $$SELECT current_count, best_count, active_days FROM public.streaks
    WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'$$,
  $$VALUES (1, 1, 1)$$,
  'first qualifying day opens the streak'
);
SELECT results_eq(
  $$SELECT current_count,
           (SELECT count(*)::int FROM public.streak_events
            WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111')
    FROM public.streaks
    WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'$$,
  $$VALUES (1, 1)$$,
  'same-day runs never advance the streak twice'
);

-- 22: unlock cache.
SELECT is(count(*)::int, 1, 'open-rule game recorded as unlocked')
FROM public.game_unlocks
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
  AND game_slug = 'm5-game';

-- 23-24: personal records (best_score 100 survives worse runs).
SELECT is(value, 100::numeric, 'best score recorded')
FROM public.personal_records
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
  AND metric = 'best_score';

SELECT is(count(*)::int, 1, 'records never downgrade')
FROM public.personal_records
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
  AND metric = 'best_score' AND value = 100::numeric;

-- 25-26: public catalog reads.
RESET ROLE;
SET ROLE anon;
SELECT is(count(*)::int, 20, 'levels are publicly readable')
FROM public.levels;

SELECT is(count(*)::int, 11, 'badges are publicly readable')
FROM public.badges;

-- 27: idempotency registry.
RESET ROLE;
SET ROLE authenticated;
SELECT tests.set_claims('a1a1a1a1-1111-1111-1111-111111111111', 'm5u1@example.com');
SELECT is(count(*)::int, 4, 'one reward event per processed attempt')
FROM public.reward_events
WHERE user_id = 'a1a1a1a1-1111-1111-1111-111111111111';

SELECT * FROM finish();
ROLLBACK;
