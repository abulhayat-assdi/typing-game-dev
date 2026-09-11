-- M8 pgTAP suite: competitions (definition, lifecycle, registration,
-- attach, finalize, rewards, adjustments, isolation). Depends on bootstrap +
-- 0001..0014 + dev seed. BEGIN/ROLLBACK (rerunnable).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

CREATE OR REPLACE FUNCTION tests.comp_create(
  p_slug text, p_batches uuid[], p_games text[], p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT public.fn_create_competition(
    p_slug, 'T ' || p_slug, '', 'SCORE_ATTACK', 'batch',
    p_batches, '{}', ARRAY['beginner'],
    (p_extra ->> 'minLevel')::int,
    (p_extra ->> 'minAccuracy')::numeric,
    (p_extra ->> 'minWpm')::numeric,
    p_games, NULL,
    '{"metric":"score"}'::jsonb, ARRAY['score','accuracy','wpm','errors','earliest'],
    'BEST_SCORE', 2, NULL, NULL,
    COALESCE(p_extra -> 'rewards',
      '{"xp":{"1":100,"participation":10},"coins":{"1":20}}'::jsonb),
    now() - interval '1 hour', now() + interval '1 hour', NULL, NULL
  ) INTO v_id;
  RETURN 'OK:' || v_id::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR:' || SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: teacher T (B101), teacher T2 (B102), admin A (org1), super SU,
-- students s1/s2 (B101), s3 (B102).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com'),
  ('e2e2e2e2-2222-2222-2222-222222222222', 'm8t2@example.com'),
  ('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com'),
  ('e4e4e4e4-4444-4444-4444-444444444444', 'm8su@example.com'),
  ('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com'),
  ('e6e6e6e6-6666-6666-6666-666666666666', 'm8s2@example.com'),
  ('e7e7e7e7-7777-7777-7777-777777777777', 'm8s3@example.com');

INSERT INTO public.profiles (id, email, full_name) VALUES
  ('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com', 'Teacher One'),
  ('e2e2e2e2-2222-2222-2222-222222222222', 'm8t2@example.com', 'Teacher Two'),
  ('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com', 'Admin A'),
  ('e4e4e4e4-4444-4444-4444-444444444444', 'm8su@example.com', 'Super Su'),
  ('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com', 'Student One'),
  ('e6e6e6e6-6666-6666-6666-666666666666', 'm8s2@example.com', 'Student Two'),
  ('e7e7e7e7-7777-7777-7777-777777777777', 'm8s3@example.com', 'Student Three');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e1e1e1e1-1111-1111-1111-111111111111', 'teacher'),
  ('e2e2e2e2-2222-2222-2222-222222222222', 'teacher'),
  ('e4e4e4e4-4444-4444-4444-444444444444', 'super_admin'),
  ('e5e5e5e5-5555-5555-5555-555555555555', 'student'),
  ('e6e6e6e6-6666-6666-6666-666666666666', 'student'),
  ('e7e7e7e7-7777-7777-7777-777777777777', 'student');
INSERT INTO public.user_roles (user_id, role, organization_id) VALUES
  ('e3e3e3e3-3333-3333-3333-333333333333', 'admin',
   '11111111-1111-1111-1111-111111111111');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'e5e5e5e5-5555-5555-5555-555555555555', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'e6e6e6e6-6666-6666-6666-666666666666', 'R-02', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'e7e7e7e7-7777-7777-7777-777777777777', 'R-01', 'beginner');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('e1e1e1e1-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('e2e2e2e2-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('m8-world', 94, 'M8');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('m8-letters', 1, 'letters', 'en', '["a"]'),
  ('m8-words', 1, 'words', 'en', '["hi"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('f8f8f8f8-8888-8888-8888-888888888888', 'm8-game', 'm8-world',
   'test', 'target-press', 'letter', 'beginner', 'm8-letters', 'standard',
   true, 1),
  ('f9f9f9f9-9999-9999-9999-999999999999', 'm8-other', 'm8-world',
   'test', 'target-press', 'letter', 'beginner', 'm8-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug IN ('m8-game', 'm8-other');

SELECT plan(45);

-- ---------------------------------------------------------------------------
-- Definition + creation gates.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');

SELECT matches(
  tests.comp_create('comp-a',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[], ARRAY['m8-game']),
  '^OK:',
  'teacher creates a competition for the assigned batch'
);

SELECT matches(
  tests.comp_create('comp-x',
    ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[], ARRAY['m8-game']),
  'FORBIDDEN',
  'teacher cannot create for unassigned batches'
);

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT matches(
  tests.comp_create('comp-y', '{}', ARRAY['m8-game']),
  'FORBIDDEN',
  'students cannot create competitions'
);

SELECT tests.set_claims('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com');
SELECT matches(
  tests.comp_create('comp-admin',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[], ARRAY['m8-game']),
  '^OK:',
  'admin creates cross-batch same-org competitions'
);

SELECT throws_ok(
  $$SELECT public.fn_create_competition(
       'bad-win', 't', '', 'SPEED', 'batch',
       '{}', '{}', '{}', NULL, NULL, NULL, ARRAY['m8-game'], NULL,
       '{"metric":"wpm"}'::jsonb, ARRAY['score'], 'BEST_WPM', 3,
       NULL, NULL, '{}'::jsonb,
       now() + interval '1 hour', now(), NULL, NULL)$$,
  'P0001', 'INVALID_WINDOW',
  'inverted windows are rejected'
);

SELECT throws_ok(
  $$SELECT public.fn_create_competition(
       'bad-game', 't', '', 'SPEED', 'batch',
       '{}', '{}', '{}', NULL, NULL, NULL, ARRAY['nope'], NULL,
       '{"metric":"wpm"}'::jsonb, ARRAY['score'], 'BEST_WPM', 3,
       NULL, NULL, '{}'::jsonb,
       now() - interval '1 hour', now() + interval '1 hour', NULL, NULL)$$,
  'P0001', 'GAME_UNKNOWN',
  'unknown games are rejected'
);

-- ---------------------------------------------------------------------------
-- Lifecycle transitions.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT lives_ok(
  $$SELECT public.fn_transition_competition(
       (SELECT id FROM public.competitions WHERE slug = 'comp-a'), 'scheduled')$$,
  'draft to scheduled'
);
SELECT throws_ok(
  $$SELECT public.fn_transition_competition(
       (SELECT id FROM public.competitions WHERE slug = 'comp-a'), 'live')$$,
  'P0001', 'ILLEGAL_TRANSITION',
  'scheduled cannot jump to live'
);
SELECT lives_ok(
  $$SELECT public.fn_transition_competition(
       (SELECT id FROM public.competitions WHERE slug = 'comp-a'), 'registration_open')$$,
  'scheduled to registration_open'
);

SELECT matches(
  tests.comp_create('comp-future',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[], ARRAY['m8-game']),
  '^OK:',
  'second competition created for timing tests'
);
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-future'), 'scheduled');
RESET ROLE;
UPDATE public.competitions
SET starts_at = now() + interval '2 hours',
    ends_at = now() + interval '4 hours'
WHERE slug = 'comp-future';
SET ROLE authenticated;
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-future'), 'registration_open');
SELECT throws_ok(
  $$SELECT public.fn_transition_competition(
       (SELECT id FROM public.competitions WHERE slug = 'comp-future'), 'live')$$,
  'P0001', 'TOO_EARLY',
  'going live before starts_at is rejected'
);

-- ---------------------------------------------------------------------------
-- Full flow on comp-main: register → attach → finalize → rewards.
-- ---------------------------------------------------------------------------
SELECT matches(
  tests.comp_create('comp-main',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[], ARRAY['m8-game']),
  '^OK:',
  'flow competition created'
);
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'), 'scheduled');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'), 'registration_open');

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_entry(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'))$$,
  'eligible student registers'
);
SELECT throws_ok(
  $$SELECT public.fn_register_entry(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'))$$,
  'P0001', 'ALREADY_REGISTERED',
  'duplicate registration is rejected'
);

SELECT tests.set_claims('e7e7e7e7-7777-7777-7777-777777777777', 'm8s3@example.com');
SELECT throws_ok(
  $$SELECT public.fn_register_entry(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'))$$,
  'P0001', 'BATCH_INELIGIBLE',
  'wrong-batch students cannot register'
);

SELECT tests.set_claims('e6e6e6e6-6666-6666-6666-666666666666', 'm8s2@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_entry(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'))$$,
  'second batch-mate registers'
);

-- minLevel gate on its own competition.
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT matches(
  tests.comp_create('comp-elite',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[], ARRAY['m8-game'],
    '{"minLevel": 9}'::jsonb),
  '^OK:',
  'leveled competition created'
);
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-elite'), 'scheduled');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-elite'), 'registration_open');
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_register_entry(
       (SELECT id FROM public.competitions WHERE slug = 'comp-elite'))$$,
  'P0001', 'LEVEL_TOO_LOW',
  'level gate enforced at registration'
);

-- ---------------------------------------------------------------------------
-- Attach: validated M4 attempts enter the live competition.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'), 'live');

-- s1: two attempts (100, then 150). s2: one attempt (120).
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT public.fn_start_attempt('m8-game', 'beginner', 'c1', 'M8 s1 run one', 900) AS s1a1 \gset
SELECT public.fn_submit_attempt(
  :'s1a1',
  '{"totalCharacters":50,"completedWords":10,"incorrectCharacters":2,"completion":100,"durationMs":60000}'::jsonb,
  100, 95, 20, true);
SELECT public.fn_start_attempt('m8-game', 'beginner', 'c2', 'M8 s1 run two', 900) AS s1a2 \gset
SELECT public.fn_submit_attempt(
  :'s1a2',
  '{"totalCharacters":60,"completedWords":12,"incorrectCharacters":1,"completion":100,"durationMs":50000}'::jsonb,
  150, 98, 30, true);

SELECT tests.set_claims('e6e6e6e6-6666-6666-6666-666666666666', 'm8s2@example.com');
SELECT public.fn_start_attempt('m8-game', 'beginner', 'c3', 'M8 s2 run', 900) AS s2a1 \gset
SELECT public.fn_submit_attempt(
  :'s2a1',
  '{"totalCharacters":55,"completedWords":11,"incorrectCharacters":3,"completion":100,"durationMs":55000}'::jsonb,
  120, 94, 25, true);

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s1 run one'))$$,
  'first validated attempt attaches'
);
SELECT throws_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s1 run one'))$$,
  'P0001', 'DUPLICATE_ATTEMPT',
  'the same attempt cannot count twice'
);
SELECT lives_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s1 run two'))$$,
  'second attempt attaches within the limit'
);
SELECT public.fn_start_attempt('m8-game', 'beginner', 'c4', 'M8 s1 extra', 900) AS s1a3 \gset
SELECT public.fn_submit_attempt(
  :'s1a3',
  '{"totalCharacters":10}'::jsonb, 10, 90, 10, true);
SELECT throws_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s1 extra'))$$,
  'P0001', 'ATTEMPT_LIMIT',
  'attempt limits are enforced'
);

-- Wrong game, foreign attempt, rejected attempt.
SELECT public.fn_start_attempt('m8-other', 'beginner', 'c5', 'M8 other game', 900) AS s1b1 \gset
SELECT public.fn_submit_attempt(
  :'s1b1',
  '{"totalCharacters":10}'::jsonb, 10, 90, 10, true);
SELECT throws_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 other game'))$$,
  'P0001', 'GAME_NOT_ALLOWED',
  'off-list games cannot enter'
);

SELECT tests.set_claims('e6e6e6e6-6666-6666-6666-666666666666', 'm8s2@example.com');
SELECT lives_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s2 run'))$$,
  'second participant attaches'
);
SELECT throws_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s1 run one'))$$,
  'P0001', 'ATTEMPT_NOT_FOUND',
  'cross-user attempts are invisible (IDOR-safe)'
);

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT public.fn_start_attempt('m8-game', 'beginner', 'c6', 'M8 s1 bad', 900) AS s1bad \gset
SELECT public.fn_submit_attempt(
  :'s1bad',
  '{"totalCharacters":10}'::jsonb, 5, 50, 5, false, 'FORGED_WPM');
SELECT throws_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 s1 bad'))$$,
  'P0001', 'ATTEMPT_INVALID',
  'rejected attempts cannot enter'
);

-- Stale attempt (created before the window) via owner insert.
RESET ROLE;
INSERT INTO public.game_attempts
  (id, user_id, game_id, game_version_id, expected_text, status, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'e5e5e5e5-5555-5555-5555-555555555555',
   'f8f8f8f8-8888-8888-8888-888888888888',
   (SELECT id FROM public.game_versions
    WHERE game_id = 'f8f8f8f8-8888-8888-8888-888888888888'),
   'M8 stale run', 'validated', now() - interval '30 days');
INSERT INTO public.attempt_results (attempt_id, raw, score, accuracy, effective_wpm, is_valid)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '{}', 200, 99, 60, true);
SET ROLE authenticated;
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_attach_attempt(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       'aaaaaaaa-0000-0000-0000-000000000001')$$,
  'P0001', 'OUTSIDE_WINDOW',
  'pre-window attempts cannot enter'
);

-- ---------------------------------------------------------------------------
-- Finalize: BEST_SCORE → s1 (150) rank 1, s2 (120) rank 2; rewards once.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'), 'ended');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'), 'processing');

SELECT results_eq(
  $$SELECT ref_id::text, rank, score FROM public.competition_results
    WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-main')
      AND scope = 'participant'
    ORDER BY rank$$,
  $$VALUES ('e5e5e5e5-5555-5555-5555-555555555555', 1, 150::numeric),
           ('e6e6e6e6-6666-6666-6666-666666666666', 2, 120::numeric)$$,
  'finalize ranks by best score deterministically'
) FROM (SELECT public.fn_finalize_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main')) AS finalized
) AS f WHERE (finalized ->> 'participants')::int = 2;

-- Ledger rows are owner-visible (M5 RLS), so assert each as the earner.
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT results_eq(
  $$SELECT amount FROM public.xp_ledger
    WHERE source = 'competition'
      AND user_id = 'e5e5e5e5-5555-5555-5555-555555555555'$$,
  $$VALUES (100)$$,
  'winner receives configured XP through the M5 ledger'
);
SELECT tests.set_claims('e6e6e6e6-6666-6666-6666-666666666666', 'm8s2@example.com');
SELECT results_eq(
  $$SELECT amount FROM public.xp_ledger
    WHERE source = 'competition'
      AND user_id = 'e6e6e6e6-6666-6666-6666-666666666666'$$,
  $$VALUES (10)$$,
  'runner-up receives the participation reward'
);
-- Managers audit all payout events for competitions they manage.
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT is(count(*)::int, 2, 'one reward event per rewarded participant')
FROM public.competition_reward_events
WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-main');

SELECT throws_ok(
  $$SELECT public.fn_finalize_competition(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'))$$,
  'P0001', 'INVALID_STATE',
  'finalized competitions cannot re-finalize'
);

-- ---------------------------------------------------------------------------
-- Server-derived leaderboard projection (0015): public fields only, caller
-- must participate, manage, or the competition must be finalized.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT results_eq(
  $$SELECT rank, display_name, score
    FROM public.fn_competition_leaderboard(
      (SELECT id FROM public.competitions WHERE slug = 'comp-main'))$$,
  $$VALUES (1, 'Student One', 150::numeric),
           (2, 'Student Two', 120::numeric)$$,
  'leaderboard exposes rank, display name and score'
);
SELECT results_eq(
  $$SELECT is_me
    FROM public.fn_competition_leaderboard(
      (SELECT id FROM public.competitions WHERE slug = 'comp-main'))
    ORDER BY rank$$,
  $$VALUES (true), (false)$$,
  'leaderboard flags the caller row'
);
SELECT tests.set_claims('e7e7e7e7-7777-7777-7777-777777777777', 'm8s3@example.com');
SELECT is(count(*)::int, 2, 'finalized board is visible to non-participants')
FROM public.fn_competition_leaderboard(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'));
SELECT tests.clear_claims();
SELECT is(count(*)::int, 0, 'anonymous callers see no board')
FROM public.fn_competition_leaderboard(
  (SELECT id FROM public.competitions WHERE slug = 'comp-main'));
SELECT tests.set_claims('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com');

-- ---------------------------------------------------------------------------
-- Batch aggregate competition (SUM over B101 vs B102). Two batches need an
-- org admin creator (a single-batch teacher is correctly forbidden).
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com');
SELECT matches(
  tests.comp_create('comp-batch',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[], ARRAY['m8-game'],
    '{"rewards": {"xp": {"participation": 5}, "coins": {}}}'::jsonb),
  '^OK:',
  'batch competition created'
);
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'), 'scheduled');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'), 'registration_open');

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT public.fn_register_entry(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'));
SELECT tests.set_claims('e7e7e7e7-7777-7777-7777-777777777777', 'm8s3@example.com');
SELECT public.fn_register_entry(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'));

SELECT tests.set_claims('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'), 'live');

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT public.fn_start_attempt('m8-game', 'beginner', 'cb1', 'M8 batch s1', 900) AS bs1 \gset
SELECT public.fn_submit_attempt(
  :'bs1',
  '{"totalCharacters":40}'::jsonb, 80, 90, 20, true);
SELECT public.fn_attach_attempt(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'),
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 batch s1'));

SELECT tests.set_claims('e7e7e7e7-7777-7777-7777-777777777777', 'm8s3@example.com');
SELECT public.fn_start_attempt('m8-game', 'beginner', 'cb2', 'M8 batch s3', 900) AS bs3 \gset
SELECT public.fn_submit_attempt(
  :'bs3',
  '{"totalCharacters":40}'::jsonb, 70, 90, 20, true);
SELECT public.fn_attach_attempt(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'),
  (SELECT id FROM public.game_attempts WHERE expected_text = 'M8 batch s3'));

SELECT tests.set_claims('e3e3e3e3-3333-3333-3333-333333333333', 'm8a@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'), 'ended');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'), 'processing');
SELECT public.fn_finalize_competition(
  (SELECT id FROM public.competitions WHERE slug = 'comp-batch'));

SELECT results_eq(
  $$SELECT ref_id::text, rank, score FROM public.competition_results
    WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-batch')
      AND scope = 'batch'
    ORDER BY rank$$,
  $$VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 80::numeric),
           ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, 70::numeric)$$,
  'batch aggregates rank by SUM'
);

-- ---------------------------------------------------------------------------
-- Adjustments, immutability, and the security matrix.
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.fn_record_adjustment(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       'participant', 'e6e6e6e6-6666-6666-6666-666666666666',
       '{"score": 125}'::jsonb, 'manual review correction')$$,
  'managers record audited adjustments'
);
SELECT is(score, 125::numeric, 'adjustment applies to the result row')
FROM public.competition_results
WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-main')
  AND scope = 'participant'
  AND ref_id = 'e6e6e6e6-6666-6666-6666-666666666666';
SELECT is(count(*)::int, 1, 'adjustment preserves old and new values')
FROM public.competition_adjustments
WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-main');

SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
UPDATE public.competition_results SET score = 999999
WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-main');
SELECT is(count(*)::int, 0, 'finalized results are immutable via the API')
FROM public.competition_results
WHERE competition_id = (SELECT id FROM public.competitions WHERE slug = 'comp-main')
  AND score = 999999;

SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_transition_competition(
       (SELECT id FROM public.competitions WHERE slug = 'comp-batch'), 'cancelled')$$,
  'P0001', 'FORBIDDEN',
  'students cannot transition competitions'
);
SELECT throws_ok(
  $$SELECT public.fn_record_adjustment(
       (SELECT id FROM public.competitions WHERE slug = 'comp-main'),
       'participant', 'e5e5e5e5-5555-5555-5555-555555555555',
       '{"score": 1}'::jsonb, 'cheat')$$,
  'P0001', 'FORBIDDEN',
  'students cannot adjust results'
);

-- Teacher Two (B102 only) cannot finalize the B101 competition.
SELECT tests.set_claims('e2e2e2e2-2222-2222-2222-222222222222', 'm8t2@example.com');
SELECT matches(
  tests.comp_create('comp-t2',
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[], ARRAY['m8-game']),
  'FORBIDDEN',
  'out-of-scope teachers cannot create here'
);

SELECT * FROM finish();
ROLLBACK;
