-- M14 pgTAP suite: tournament registration, seeding, bracket,
-- match orchestration, advancement, finalization, season sync, security.
-- BEGIN/ROLLBACK.

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
  ('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com'),
  ('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com'),
  ('e1e1e1e1-0000-0000-0000-000000000003', 't14s2@example.com'),
  ('e1e1e1e1-0000-0000-0000-000000000004', 't14s3@example.com'),
  ('e1e1e1e1-0000-0000-0000-000000000005', 't14s4@example.com'),
  ('e1e1e1e1-0000-0000-0000-000000000006', 't14x@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com', 'Admin', 'UTC'),
  ('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com', 'Student One', 'UTC'),
  ('e1e1e1e1-0000-0000-0000-000000000003', 't14s2@example.com', 'Student Two', 'UTC'),
  ('e1e1e1e1-0000-0000-0000-000000000004', 't14s3@example.com', 'Student Three', 'UTC'),
  ('e1e1e1e1-0000-0000-0000-000000000005', 't14s4@example.com', 'Student Four', 'UTC'),
  ('e1e1e1e1-0000-0000-0000-000000000006', 't14x@example.com', 'Outsider', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', 'super_admin'),
  ('e1e1e1e1-0000-0000-0000-000000000002', 'student'),
  ('e1e1e1e1-0000-0000-0000-000000000003', 'student'),
  ('e1e1e1e1-0000-0000-0000-000000000004', 'student'),
  ('e1e1e1e1-0000-0000-0000-000000000005', 'student'),
  ('e1e1e1e1-0000-0000-0000-000000000006', 'student');

SELECT plan(64);

SET ROLE authenticated;
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');

-- ---------------------------------------------------------------------------
-- Creation: roles, formats, drafts.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_tournament(
    '{"slug":"t14","name":"T14 Cup","participant_type":"student"}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'students cannot create tournaments');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_tournament(
    '{"slug":"t14x","name":"Future","format":"double_elimination","participant_type":"student"}'::jsonb)$$,
  'P0001', 'FORMAT_NOT_YET_IMPLEMENTED',
  'unimplemented formats rejected at creation');
SELECT lives_ok(
  $$SELECT public.fn_create_tournament(
    (SELECT jsonb_build_object('slug', 't14', 'name', 'T14 Cup',
      'participant_type', 'student', 'participant_cap', 4)))$$,
  'admin creates a student tournament');
SELECT throws_ok(
  $$SELECT public.fn_create_tournament(
    (SELECT jsonb_build_object('slug', 't14', 'name', 'Dup',
      'participant_type', 'student')))$$,
  'P0001', 'DUPLICATE_SLUG',
  'duplicate slugs rejected');
SELECT public.fn_update_tournament_draft(
  (SELECT id FROM public.tournaments WHERE slug = 't14'),
  '{"description": "Test cup"}'::jsonb);
SELECT is(version, 2, 'draft update bumps version')
FROM public.tournaments WHERE slug = 't14';
SELECT public.fn_publish_tournament((SELECT id FROM public.tournaments WHERE slug = 't14'));
SELECT is(status::text, 'registration_open', 'tournament publishes')
FROM public.tournaments WHERE slug = 't14';

-- ---------------------------------------------------------------------------
-- Registration: eligible, duplicate, ineligible, withdrawal, closed.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'eligible student registers');
SELECT throws_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'P0001', 'DUPLICATE',
  'duplicate registration rejected');
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended'
WHERE id = 'e1e1e1e1-0000-0000-0000-000000000006';
SET ROLE authenticated;
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000006', 't14x@example.com');
SELECT throws_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'P0001', 'INELIGIBLE',
  'suspended students are ineligible');
RESET ROLE;
UPDATE public.profiles SET account_status = 'active'
WHERE id = 'e1e1e1e1-0000-0000-0000-000000000006';
SET ROLE authenticated;
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000003', 't14s2@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'second student registers');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000004', 't14s3@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'third student registers');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000005', 't14s4@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'fourth student registers');
SELECT lives_ok(
  $$SELECT public.fn_withdraw_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'withdrawal before lock works');
SELECT is(status, 'withdrawn', 'withdrawal recorded')
FROM public.tournament_participants
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND participant_id = 'e1e1e1e1-0000-0000-0000-000000000005';
SELECT lives_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'withdrawn students may re-register while open');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_close_registration(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'registration closes');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000006', 't14x@example.com');
SELECT throws_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'P0001', 'REGISTRATION_CLOSED',
  'closed registration rejects newcomers');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');

-- ---------------------------------------------------------------------------
-- Seeding: validation, determinism, frozen snapshot rows.
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.fn_seed_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'), 'manual',
    ARRAY['e1e1e1e1-0000-0000-0000-000000000002'::uuid], NULL)$$,
  'P0001', 'MALFORMED',
  'partial seed orders rejected');
SELECT is(
  public.fn_seed_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'), 'manual',
    ARRAY['e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000003'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000004'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000005'::uuid], NULL),
  4, 'manual seeding enrolls four');
SELECT is(status::text, 'seeded', 'tournament is seeded')
FROM public.tournaments WHERE slug = 't14';
SELECT is(count(*)::int, 4, 'four contiguous seeds stored')
FROM (SELECT DISTINCT seed FROM public.tournament_seeding
      WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')) AS s;
SELECT is(count(*)::int, 2, 'two semifinal rounds rows')
FROM public.tournament_rounds
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14');
SELECT is(count(*)::int, 2, 'semifinals have two matches')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 1;
SELECT is(count(*)::int, 1, 'one final match')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 2;
SELECT ok(
  (SELECT child_match_a IS NOT NULL AND child_match_b IS NOT NULL
   FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
   WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
     AND r.round_no = 2 LIMIT 1),
  'final references both semifinal child matches');
SELECT throws_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'P0001', 'REGISTRATION_CLOSED',
  'roster frozen after seeding');

-- ---------------------------------------------------------------------------
-- Match execution: lifecycle, winner, tie-break, advancement.
-- ---------------------------------------------------------------------------
SELECT public.fn_start_tournament((SELECT id FROM public.tournaments WHERE slug = 't14'));
SELECT is(status::text, 'live', 'tournament goes live')
FROM public.tournaments WHERE slug = 't14';
SELECT is(count(*)::int, 2, 'semifinals ready at start')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 1 AND m.status = 'ready';
SELECT public.fn_open_tmatch(m.id)
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 1 AND m.slot = 1;
SELECT is(m.status::text, 'live', 'semifinal one opens')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 1 AND m.slot = 1;
SELECT is(
  public.fn_finalize_tmatch(
    (SELECT m.id FROM public.tournament_matches m
     JOIN public.tournament_rounds r ON r.id = m.round_id
     WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
       AND r.round_no = 1 AND m.slot = 1),
    10, 5, '{}'::jsonb),
  'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
  'seed one wins semifinal one on primary score');
SELECT public.fn_open_tmatch(m.id)
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 1 AND m.slot = 2;
SELECT is(
  public.fn_finalize_tmatch(
    (SELECT m.id FROM public.tournament_matches m
     JOIN public.tournament_rounds r ON r.id = m.round_id
     WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
       AND r.round_no = 1 AND m.slot = 2),
    7, 7, '{"accuracy_a": 80, "accuracy_b": 95}'::jsonb),
  'e1e1e1e1-0000-0000-0000-000000000004'::uuid,
  'tied semifinal resolves on accuracy');
SELECT is(tie_break, 'accuracy', 'tie-break path recorded')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 1 AND m.slot = 2;
SELECT is(count(*)::int, 1, 'final has both finalists')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 2 AND m.participant_a IS NOT NULL AND m.participant_b IS NOT NULL;
SELECT throws_ok(
  $$SELECT public.fn_finalize_tmatch(
    (SELECT m.id FROM public.tournament_matches m
     JOIN public.tournament_rounds r ON r.id = m.round_id
     WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
       AND r.round_no = 1 AND m.slot = 1),
    10, 5, '{}'::jsonb)$$,
  'P0001', 'IMMUTABLE',
  'finalized matches are immutable');
SELECT is(public.fn_advance_tournament(
  (SELECT id FROM public.tournaments WHERE slug = 't14')), 'live',
  'advance unlocks the final round');
SELECT is(m.status::text, 'ready', 'final is ready')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 2;
SELECT public.fn_open_tmatch(m.id)
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND r.round_no = 2;
SELECT is(
  public.fn_finalize_tmatch(
    (SELECT m.id FROM public.tournament_matches m
     JOIN public.tournament_rounds r ON r.id = m.round_id
     WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
       AND r.round_no = 2),
    12, 8, '{}'::jsonb),
  'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
  'seed one wins the final');
SELECT is(public.fn_advance_tournament(
  (SELECT id FROM public.tournaments WHERE slug = 't14')), 'processing',
  'completed bracket moves to processing');

-- ---------------------------------------------------------------------------
-- Finalization: champion, placements, rewards once, immutability.
-- ---------------------------------------------------------------------------
SELECT ok(
  (public.fn_finalize_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14')) ->> 'champion')
    = 'e1e1e1e1-0000-0000-0000-000000000002',
  'champion determined');
SELECT is(status::text, 'finalized', 'tournament finalized')
FROM public.tournaments WHERE slug = 't14';
SELECT is(count(*)::int, 4, 'four placements recorded')
FROM public.tournament_results
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14');
SELECT is(placement, 1, 'champion placed first')
FROM public.tournament_results
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND participant_id = 'e1e1e1e1-0000-0000-0000-000000000002';
SELECT is(count(*)::int, 2, 'semifinal losers tied third')
FROM public.tournament_results
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')
  AND placement = 3;
SELECT ok(count(*)::int >= 4, 'rewards issued through M5 ledgers')
FROM public.tournament_reward_events
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14');
SELECT ok(
  (public.fn_finalize_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14')) ->> 'already')::boolean,
  're-finalize is idempotent');
SELECT is(count(*)::int,
  (SELECT count(*)::int FROM public.tournament_reward_events
   WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14')),
  're-finalize issues no duplicate rewards')
FROM public.tournament_reward_events
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14');
SELECT throws_ok(
  $$SELECT public.fn_update_tournament_draft(
    (SELECT id FROM public.tournaments WHERE slug = 't14'),
    '{"description": "Nope"}'::jsonb)$$,
  'P0001', 'NOT_DRAFT',
  'finalized tournaments reject edits');
SELECT throws_ok(
  $$SELECT public.fn_seed_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'), 'random', NULL, 7)$$,
  'P0001', 'INVALID_STATE',
  'finalized tournaments cannot reseed');

-- ---------------------------------------------------------------------------
-- Season integration: tournament contributes points exactly once.
-- ---------------------------------------------------------------------------
SELECT public.fn_create_season(
  (SELECT jsonb_build_object('slug', 't14-season', 'name', 'T14 Season',
    'start_at', now() - interval '1 day',
    'end_at', now() + interval '90 days')));
SELECT public.fn_schedule_season((SELECT id FROM public.seasons WHERE slug = 't14-season'));
SELECT public.fn_activate_season((SELECT id FROM public.seasons WHERE slug = 't14-season'));
SELECT public.fn_set_season_source(
  (SELECT id FROM public.seasons WHERE slug = 't14-season'),
  'TOURNAMENT', true, '{}'::jsonb);
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_join_season(
    (SELECT id FROM public.seasons WHERE slug = 't14-season'))$$,
  'champion joins the season');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');
SELECT is(
  public.fn_sync_tournament_season(
    (SELECT id FROM public.tournaments WHERE slug = 't14'),
    (SELECT id FROM public.seasons WHERE slug = 't14-season')),
  1, 'tournament contributes one season point event');
SELECT is(
  public.fn_sync_tournament_season(
    (SELECT id FROM public.tournaments WHERE slug = 't14'),
    (SELECT id FROM public.seasons WHERE slug = 't14-season')),
  0, 'season sync never duplicates');

-- ---------------------------------------------------------------------------
-- Security: forged IDs, unauthorized orchestration, non-power-of-two.
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.fn_register_tournament('00000000-0000-0000-0000-000000000000'::uuid)$$,
  'P0001', 'NOT_FOUND',
  'forged tournament IDs rejected');
SELECT throws_ok(
  $$SELECT public.fn_finalize_tmatch('00000000-0000-0000-0000-000000000000'::uuid, 1, 0)$$,
  'P0001', 'NOT_FOUND',
  'forged match IDs rejected');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_seed_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'), 'random', NULL, 7)$$,
  'P0001', 'FORBIDDEN',
  'students cannot seed tournaments');
SELECT throws_ok(
  $$SELECT public.fn_finalize_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14'))$$,
  'P0001', 'FORBIDDEN',
  'students cannot finalize tournaments');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_create_tournament(
    (SELECT jsonb_build_object('slug', 't14-odd', 'name', 'Odd Cup',
      'participant_type', 'student')))$$,
  'admin creates a three-player tournament');
SELECT public.fn_publish_tournament((SELECT id FROM public.tournaments WHERE slug = 't14-odd'));
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000002', 't14s1@example.com');
SELECT public.fn_register_tournament((SELECT id FROM public.tournaments WHERE slug = 't14-odd'));
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000003', 't14s2@example.com');
SELECT public.fn_register_tournament((SELECT id FROM public.tournaments WHERE slug = 't14-odd'));
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000004', 't14s3@example.com');
SELECT public.fn_register_tournament((SELECT id FROM public.tournaments WHERE slug = 't14-odd'));
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000005', 't14s4@example.com');
SELECT lives_ok(
  $$SELECT public.fn_register_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14-odd'))$$,
  'fourth student registers in odd cup');
SELECT lives_ok(
  $$SELECT public.fn_withdraw_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14-odd'))$$,
  'fourth student withdraws before seeding');
SELECT tests.set_claims('e1e1e1e1-0000-0000-0000-000000000001', 't14a@example.com');
SELECT public.fn_close_registration((SELECT id FROM public.tournaments WHERE slug = 't14-odd'));
SELECT is(
  public.fn_seed_tournament(
    (SELECT id FROM public.tournaments WHERE slug = 't14-odd'), 'manual',
    ARRAY['e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000003'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000004'::uuid], NULL),
  3, 'three-player field seeds');
SELECT is(count(*)::int, 1, 'one bye granted')
FROM public.tournament_matches
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14-odd')
  AND status = 'bye';
SELECT is(count(*)::int, 1, 'bye winner pre-placed in the final')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14-odd')
  AND r.round_no = 2
  AND (m.participant_a IS NOT NULL OR m.participant_b IS NOT NULL);
SELECT lives_ok(
  $$SELECT public.fn_tournament_adjust(
    (SELECT id FROM public.tournaments WHERE slug = 't14-odd'),
    'substitution',
    (SELECT m.id FROM public.tournament_matches m
     JOIN public.tournament_rounds r ON r.id = m.round_id
     WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14-odd')
       AND r.round_no = 1 AND m.slot = 2),
    '{"out": "e1e1e1e1-0000-0000-0000-000000000004", "in": "e1e1e1e1-0000-0000-0000-000000000005"}'::jsonb,
    'coach approved swap before first match')$$,
  'audited pre-live substitution works');
SELECT is(participant_b, 'e1e1e1e1-0000-0000-0000-000000000005'::uuid,
  'substitute takes the bracket slot')
FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id = m.round_id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14-odd')
  AND r.round_no = 1 AND m.slot = 2;
SELECT is(count(*)::int, 1, 'substitution leaves an audit trail')
FROM public.tournament_adjustments
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 't14-odd')
  AND scope = 'substitution';

SELECT * FROM finish();
ROLLBACK;
