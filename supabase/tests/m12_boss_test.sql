-- M12 pgTAP suite: boss definitions, instances, damage, phases,
-- rewards, security. BEGIN/ROLLBACK.

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
  ('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com'),
  ('e2e2e2e2-0000-0000-0000-000000000002', 'b12t@example.com'),
  ('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com'),
  ('e2e2e2e2-0000-0000-0000-000000000004', 'b12s2@example.com'),
  ('e2e2e2e2-0000-0000-0000-000000000005', 'b12x@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com', 'Admin', 'UTC'),
  ('e2e2e2e2-0000-0000-0000-000000000002', 'b12t@example.com', 'Teacher', 'UTC'),
  ('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com', 'Student One', 'UTC'),
  ('e2e2e2e2-0000-0000-0000-000000000004', 'b12s2@example.com', 'Student Two', 'UTC'),
  ('e2e2e2e2-0000-0000-0000-000000000005', 'b12x@example.com', 'Outsider', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e2e2e2e2-0000-0000-0000-000000000001', 'super_admin'),
  ('e2e2e2e2-0000-0000-0000-000000000002', 'teacher'),
  ('e2e2e2e2-0000-0000-0000-000000000003', 'student'),
  ('e2e2e2e2-0000-0000-0000-000000000004', 'student'),
  ('e2e2e2e2-0000-0000-0000-000000000005', 'student');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('e2e2e2e2-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'e2e2e2e2-0000-0000-0000-000000000003', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'e2e2e2e2-0000-0000-0000-000000000004', 'R-02', 'beginner');

INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('b12-world', 102, 'B12');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('b12-letters', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('b1b1b1b1-1111-1111-1111-111111111111', 'boss-game', 'b12-world',
   'test', 'target-press', 'letter', 'beginner', 'b12-letters', 'standard',
   true, 1),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'boss-other', 'b12-world',
   'test', 'target-press', 'letter', 'beginner', 'b12-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug IN ('boss-game', 'boss-other');

SELECT plan(44);

SET ROLE authenticated;
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');

-- ---------------------------------------------------------------------------
-- Definitions: admin CRUD, versioning, phases.
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.fn_create_boss('{"slug":"x","name":"X","max_hp":10}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'students cannot create bosses'
);
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_create_boss(
    '{"slug":"test-mite","name":"Test Mite","max_hp":100}'::jsonb)$$,
  'admin creates a boss');
SELECT throws_ok(
  $$SELECT public.fn_create_boss(
    '{"slug":"test-mite","name":"Dup","max_hp":100}'::jsonb)$$,
  'P0001', 'DUPLICATE_SLUG',
  'duplicate slugs rejected');
SELECT throws_ok(
  $$SELECT public.fn_create_boss('{"slug":"bad","name":"Bad"}'::jsonb)$$,
  'P0001', 'MALFORMED',
  'hp is required');
SELECT public.fn_update_boss_draft(
  (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
  '{"description": "Tiny but fierce"}'::jsonb);
SELECT is(version, 2, 'draft update bumps version')
FROM public.boss_definitions WHERE slug = 'test-mite';
SELECT is(count(*)::int, 1, 'version snapshotted')
FROM public.boss_versions
WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite');
SELECT lives_ok(
  $$SELECT public.fn_add_boss_phase(
    (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
    0, 'Shell', 100, 50, '{"games": ["boss-game"]}'::jsonb, 1, '{}'::jsonb)$$,
  'first phase added');
SELECT lives_ok(
  $$SELECT public.fn_add_boss_phase(
    (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
    1, 'Core', 50, 0, '{}'::jsonb, 2, '{}'::jsonb)$$,
  'second phase added');
SELECT throws_ok(
  $$SELECT public.fn_add_boss_phase(
    (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
    2, 'Bad', 10, 20, '{}'::jsonb, 1, '{}'::jsonb)$$,
  'P0001', 'MALFORMED',
  'inverted bands rejected');
SELECT throws_ok(
  $$SELECT public.fn_add_boss_phase(
    (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
    1, 'Dup', 50, 0, '{}'::jsonb, 1, '{}'::jsonb)$$,
  'P0001', 'DUPLICATE_POSITION',
  'duplicate positions rejected');
SELECT public.fn_set_boss_status(
  (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'), 'active');
SELECT throws_ok(
  $$SELECT public.fn_update_boss_draft(
    (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
    '{"description": "Nope"}'::jsonb)$$,
  'P0001', 'NOT_DRAFT',
  'active bosses reject draft edits');

SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT is(count(*)::int, 6, 'students see active bosses')
FROM public.boss_definitions WHERE status = 'active';
SELECT is(count(*)::int, 0, 'students never see drafts')
FROM public.boss_definitions WHERE status = 'draft';

-- ---------------------------------------------------------------------------
-- Instances: schedule, activate, eligibility snapshot.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_boss_instance(
    (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    now(), now() + interval '2 hours', 10)$$,
  'P0001', 'FORBIDDEN',
  'students cannot schedule boss battles');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');
SELECT public.fn_create_boss_instance(
  (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
  (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now(), now() + interval '2 hours', 10) AS bi \gset
SELECT lives_ok(
  $$SELECT public.fn_activate_boss_instance(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1))$$,
  'battle activates');
SELECT throws_ok(
  $$SELECT public.fn_activate_boss_instance(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'INVALID_STATE',
  'double activation rejected');
SELECT is(count(*)::int, 2, 'eligibility frozen at activation')
FROM public.boss_participants WHERE instance_id = :'bi';
SELECT is(count(*)::int, 0, 'outsiders never enter the roster')
FROM public.boss_participants
WHERE instance_id = :'bi'
  AND user_id = 'e2e2e2e2-0000-0000-0000-000000000005';

-- ---------------------------------------------------------------------------
-- Damage: validated attempts only, pool and phase gates enforced.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12a', 'Boss run one', 900) AS ba1 \gset
SELECT public.fn_submit_attempt(
  :'ba1', '{"totalCharacters":40}'::jsonb, 25, 95, 10, true);
SELECT lives_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss run one'))$$,
  'validated attempt deals damage');
SELECT is(damage > 0, true, 'damage follows the profile')
FROM public.boss_damage_events
WHERE user_id = 'e2e2e2e2-0000-0000-0000-000000000003';
SELECT is(current_hp < initial_hp, true, 'boss HP decreases')
FROM public.boss_instances WHERE id = :'bi';

SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12b', 'Boss pending', 900) AS ba2 \gset
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss pending'))$$,
  'P0001', 'NOT_VALIDATED',
  'unvalidated attempts rejected');
SELECT public.fn_start_attempt('boss-other', 'beginner', 'b12c', 'Boss wrong game', 900) AS ba3 \gset
SELECT public.fn_submit_attempt(
  :'ba3', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss wrong game'))$$,
  'P0001', 'GAME_NOT_ALLOWED',
  'off-pool games rejected');

SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000004', 'b12s2@example.com');
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss run one'))$$,
  'P0001', 'ATTEMPT_FORBIDDEN',
  'foreign attempts rejected');

-- Phase accuracy gate via a gated keeper boss.
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');
SELECT public.fn_create_boss(
  '{"slug":"gate-keeper","name":"Gate Keeper","max_hp":10000}'::jsonb) AS gk \gset
SELECT public.fn_add_boss_phase(:'gk', 0, 'Gate', 10000, 0,
  '{"games": ["boss-game"]}'::jsonb, 1, '{"min_accuracy": 99}'::jsonb);
SELECT public.fn_set_boss_status(:'gk', 'active');
SELECT public.fn_create_boss_instance(:'gk',
  (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now(), now() + interval '2 hours', 2) AS gki \gset
SELECT public.fn_activate_boss_instance(:'gki');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'gate-keeper') ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss run one'))$$,
  'P0001', 'BELOW_PHASE_BAR',
  'phase accuracy gates enforced');
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12h', 'Boss sharp one', 900) AS ba8 \gset
SELECT public.fn_submit_attempt(
  :'ba8', '{"totalCharacters":40}'::jsonb, 60, 99, 10, true);
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12i', 'Boss sharp two', 900) AS ba9 \gset
SELECT public.fn_submit_attempt(
  :'ba9', '{"totalCharacters":40}'::jsonb, 60, 99, 10, true);
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12j', 'Boss sharp three', 900) AS ba10 \gset
SELECT public.fn_submit_attempt(
  :'ba10', '{"totalCharacters":40}'::jsonb, 60, 99, 10, true);
SELECT public.fn_submit_boss_attempt(
  (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'gate-keeper') ORDER BY created_at DESC LIMIT 1),
  :'ba8');
SELECT public.fn_submit_boss_attempt(
  (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'gate-keeper') ORDER BY created_at DESC LIMIT 1),
  :'ba9');
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'gate-keeper') ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss sharp three'))$$,
  'P0001', 'ATTEMPT_LIMIT',
  'per-member caps enforced');

-- Duplicate + per-member cap on the main instance.
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite') ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss run one'))$$,
  'P0001', 'DUPLICATE',
  'one damage event per attempt');

-- Second member joins the kill; member one keeps hammering (limit 10).
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000004', 'b12s2@example.com');
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12d', 'Boss s2 run', 900) AS ba4 \gset
SELECT public.fn_submit_attempt(
  :'ba4', '{"totalCharacters":40}'::jsonb, 20, 96, 10, true);
SELECT public.fn_submit_boss_attempt(
  (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite') ORDER BY created_at DESC LIMIT 1),
  :'ba4');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12e', 'Boss run 3', 900) AS ba5 \gset
SELECT public.fn_submit_attempt(
  :'ba5', '{"totalCharacters":40}'::jsonb, 25, 97, 10, true);
SELECT public.fn_submit_boss_attempt(
  (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite') ORDER BY created_at DESC LIMIT 1),
  :'ba5');
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12f', 'Boss run 4', 900) AS ba6 \gset
SELECT public.fn_submit_attempt(
  :'ba6', '{"totalCharacters":40}'::jsonb, 25, 97, 10, true);
SELECT public.fn_submit_boss_attempt(
  (SELECT id FROM public.boss_instances WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite') ORDER BY created_at DESC LIMIT 1),
  :'ba6');
SELECT is(status::text, 'defeated', 'hp zero defeats the boss')
FROM public.boss_instances WHERE id = :'bi';
SELECT is(current_hp, 0::bigint, 'hp never goes negative')
FROM public.boss_instances WHERE id = :'bi';
SELECT is(count(*)::int >= 1, true, 'phase crossings recorded')
FROM public.boss_phase_events WHERE instance_id = :'bi';

-- ---------------------------------------------------------------------------
-- Rewards: participation + defeat, once each, then sealed.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_finalize_boss(
    (SELECT id FROM public.boss_instances
     WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite')
     ORDER BY created_at DESC LIMIT 1))$$,
  'boss finalizes');
SELECT is(outcome, 'defeated', 'outcome recorded')
FROM public.boss_results
WHERE instance_id = :'bi';
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT results_eq(
  $$SELECT amount FROM public.xp_ledger
    WHERE source = 'boss'
      AND user_id = 'e2e2e2e2-0000-0000-0000-000000000003'
    ORDER BY amount$$,
  $$VALUES (20), (100)$$,
  'participation plus defeat pay once each');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT public.fn_finalize_boss(:'bi');
SELECT is(count(*)::int, 2, 're-finalize never double-pays')
FROM public.xp_ledger
WHERE source = 'boss'
  AND user_id = 'e2e2e2e2-0000-0000-0000-000000000003';
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');

-- ---------------------------------------------------------------------------
-- Expiry: participation per policy, no defeat bonus.
-- ---------------------------------------------------------------------------
SELECT public.fn_create_boss_instance(
  (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite'),
  (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  now() - interval '3 hours', now() + interval '1 hour', 10) AS bi2 \gset
SELECT public.fn_activate_boss_instance(:'bi2');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT public.fn_start_attempt('boss-game', 'beginner', 'b12g', 'Boss late run', 900) AS ba7 \gset
SELECT public.fn_submit_attempt(
  :'ba7', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT public.fn_submit_boss_attempt(:'bi2', :'ba7');
RESET ROLE;
UPDATE public.boss_instances SET end_at = now() - interval '1 minute'
WHERE id = :'bi2';
SET ROLE authenticated;
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000001', 'b12a@example.com');
SELECT public.fn_boss_sweep();
SELECT is(status::text, 'finalized', 'expired battles settle')
FROM public.boss_instances WHERE id = :'bi2';
SELECT is(outcome, 'expired', 'expiry recorded distinctly')
FROM public.boss_results WHERE instance_id = :'bi2';
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT is(count(*)::int, 1, 'expiry still pays participation')
FROM public.boss_reward_events
WHERE instance_id = :'bi2' AND kind = 'participation';
SELECT is(count(*)::int, 0, 'no defeat bonus without a kill')
FROM public.boss_reward_events
WHERE instance_id = :'bi2' AND kind = 'defeat';

-- ---------------------------------------------------------------------------
-- Security: outsiders, wrong clan, forged ids, role gates.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000002', 'b12t@example.com');
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    (SELECT id FROM public.boss_instances
     WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'gate-keeper')
     ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss late run'))$$,
  'P0001', 'NOT_PARTICIPANT',
  'non-participant staff cannot deal damage');
SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000005', 'b12x@example.com');
SELECT is(
  public.fn_boss_state((SELECT id FROM public.boss_instances
    WHERE boss_id = (SELECT id FROM public.boss_definitions WHERE slug = 'test-mite')
    ORDER BY created_at ASC LIMIT 1)),
  NULL::jsonb, 'outsiders see no boss state');

SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000002', 'b12t@example.com');
SELECT throws_ok(
  $$SELECT public.fn_activate_boss_instance(
    (SELECT id FROM public.boss_instances ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'FORBIDDEN',
  'teachers cannot activate battles');
SELECT is(count(*)::int, 3, 'teachers see assigned clan battles')
FROM public.boss_instances i
JOIN public.clans c ON c.id = i.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT tests.set_claims('e2e2e2e2-0000-0000-0000-000000000003', 'b12s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_submit_boss_attempt(
    '00000000-0000-0000-0000-000000000000',
    (SELECT id FROM public.game_attempts WHERE expected_text = 'Boss late run'))$$,
  'P0001', 'NOT_FOUND',
  'forged instance ids rejected');
SELECT throws_ok(
  $$SELECT public.fn_finalize_boss(
    '00000000-0000-0000-0000-000000000000')$$,
  'P0001', 'NOT_FOUND',
  'forged finalize rejected');

SELECT * FROM finish();
ROLLBACK;
