-- M13 pgTAP suite: season lifecycle, eligibility, points, ranking,
-- finalization, security. BEGIN/ROLLBACK.

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
  ('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 's13t@example.com'),
  ('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com'),
  ('d1d1d1d1-0000-0000-0000-000000000004', 's13s2@example.com'),
  ('d1d1d1d1-0000-0000-0000-000000000005', 's13x@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com', 'Admin', 'UTC'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 's13t@example.com', 'Teacher', 'UTC'),
  ('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com', 'Student One', 'UTC'),
  ('d1d1d1d1-0000-0000-0000-000000000004', 's13s2@example.com', 'Student Two', 'UTC'),
  ('d1d1d1d1-0000-0000-0000-000000000005', 's13x@example.com', 'Outsider', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'super_admin'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'teacher'),
  ('d1d1d1d1-0000-0000-0000-000000000003', 'student'),
  ('d1d1d1d1-0000-0000-0000-000000000004', 'student'),
  ('d1d1d1d1-0000-0000-0000-000000000005', 'student');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'd1d1d1d1-0000-0000-0000-000000000003', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'd1d1d1d1-0000-0000-0000-000000000004', 'R-02', 'beginner');

-- Finalized source outcomes inside the season window (as the owner).
INSERT INTO public.competitions
  (id, slug, title, type, status, ends_at, starts_at)
VALUES
  ('d1d1d1d1-0000-0000-0000-000000000010', 's13-comp', 'S13 Cup',
   'SCORE_ATTACK', 'finalized', now(), now() - interval '1 hour'),
  ('d1d1d1d1-0000-0000-0000-000000000011', 's13-old', 'Old Cup',
   'SCORE_ATTACK', 'finalized', now() - interval '10 days', now() - interval '11 days');
INSERT INTO public.competition_entries
  (competition_id, user_id, batch_id)
VALUES
  ('d1d1d1d1-0000-0000-0000-000000000010',
   'd1d1d1d1-0000-0000-0000-000000000003',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('d1d1d1d1-0000-0000-0000-000000000010',
   'd1d1d1d1-0000-0000-0000-000000000004',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO public.competition_results
  (competition_id, scope, ref_id, rank, score)
VALUES
  ('d1d1d1d1-0000-0000-0000-000000000010', 'participant',
   'd1d1d1d1-0000-0000-0000-000000000003', 1, 150),
  ('d1d1d1d1-0000-0000-0000-000000000010', 'participant',
   'd1d1d1d1-0000-0000-0000-000000000004', 2, 120);

INSERT INTO public.clan_wars
  (id, challenger_clan_id, defender_clan_id, status, finalized_at)
SELECT 'd1d1d1d1-0000-0000-0000-000000000020', c1.id, c2.id,
       'finalized', now()
FROM public.clans c1, public.clans c2
WHERE c1.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND c2.batch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.clan_war_results (war_id, clan_id, total_score, participants, rank, is_winner)
SELECT 'd1d1d1d1-0000-0000-0000-000000000020', c.id, 100, 1, 1, true
FROM public.clans c WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
INSERT INTO public.clan_war_results (war_id, clan_id, total_score, participants, rank, is_winner)
SELECT 'd1d1d1d1-0000-0000-0000-000000000020', c.id, 60, 1, 2, false
FROM public.clans c WHERE c.batch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

INSERT INTO public.boss_instances
  (id, boss_id, clan_id, status, start_at, end_at,
   initial_hp, current_hp, finalized_at)
SELECT 'd1d1d1d1-0000-0000-0000-000000000030',
       d.id, c.id, 'finalized', now() - interval '2 hours', now(),
       100, 0, now()
FROM public.boss_definitions d, public.clans c
WHERE d.slug = 'stone-titan'
  AND c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
INSERT INTO public.boss_results
  (instance_id, total_damage, contributors, outcome)
VALUES ('d1d1d1d1-0000-0000-0000-000000000030', 100, 1, 'defeated');
INSERT INTO public.boss_participants (instance_id, user_id, attempts_used, damage)
VALUES ('d1d1d1d1-0000-0000-0000-000000000030',
        'd1d1d1d1-0000-0000-0000-000000000003', 2, 100);

INSERT INTO public.missions
  (id, slug, title, status)
VALUES ('d1d1d1d1-0000-0000-0000-000000000040', 's13-daily', 'S13 Daily', 'active'),
       ('d1d1d1d1-0000-0000-0000-000000000044', 's13-daily-2', 'S13 Daily Two', 'active');
INSERT INTO public.mission_instances
  (id, mission_id, user_id, period, period_start, status, completed_at)
VALUES ('d1d1d1d1-0000-0000-0000-000000000041',
        'd1d1d1d1-0000-0000-0000-000000000040',
        'd1d1d1d1-0000-0000-0000-000000000003',
        'daily', CURRENT_DATE, 'completed', now()),
       ('d1d1d1d1-0000-0000-0000-000000000042',
        'd1d1d1d1-0000-0000-0000-000000000044',
        'd1d1d1d1-0000-0000-0000-000000000003',
        'daily', CURRENT_DATE, 'completed', now()),
       ('d1d1d1d1-0000-0000-0000-000000000043',
        'd1d1d1d1-0000-0000-0000-000000000040',
        'd1d1d1d1-0000-0000-0000-000000000004',
        'daily', CURRENT_DATE, 'completed', now());

SELECT plan(47);

SET ROLE authenticated;
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com');

-- ---------------------------------------------------------------------------
-- Lifecycle: create, draft, schedule, activate, cancel, overlap.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_season(
    '{"slug":"x","name":"X","start_at":"2026-10-01T00:00:00Z","end_at":"2026-12-31T00:00:00Z"}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'students cannot create seasons');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_create_season(
    (SELECT jsonb_build_object('slug', 's13', 'name', 'Season Thirteen',
      'start_at', now() - interval '1 day',
      'end_at', now() + interval '90 days')))$$,
  'admin creates a season');
SELECT throws_ok(
  $$SELECT public.fn_create_season(
    (SELECT jsonb_build_object('slug', 's13', 'name', 'Dup',
      'start_at', now() - interval '1 day',
      'end_at', now() + interval '90 days')))$$,
  'P0001', 'DUPLICATE_SLUG',
  'duplicate slugs rejected');
SELECT throws_ok(
  $$SELECT public.fn_create_season('{"slug":"bad","name":"Bad"}'::jsonb)$$,
  'P0001', 'MALFORMED',
  'window is required');
SELECT public.fn_update_season_draft(
  (SELECT id FROM public.seasons WHERE slug = 's13'),
  '{"description": "Test season"}'::jsonb);
SELECT is(version, 2, 'draft update bumps version')
FROM public.seasons WHERE slug = 's13';
SELECT lives_ok(
  $$SELECT public.fn_set_season_source(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'COMPETITION', true, '{}'::jsonb)$$,
  'competition source enabled');
SELECT lives_ok(
  $$SELECT public.fn_set_season_source(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'CLAN_WAR', true, '{}'::jsonb)$$,
  'war source enabled');
SELECT lives_ok(
  $$SELECT public.fn_set_season_source(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'CLAN_BOSS', true, '{}'::jsonb)$$,
  'boss source enabled');
SELECT lives_ok(
  $$SELECT public.fn_set_season_source(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'MISSION', true, '{"points": 5}'::jsonb)$$,
  'mission source enabled');
SELECT lives_ok(
  $$SELECT public.fn_set_season_tier(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'Gold', 200, NULL)$$,
  'gold tier configured');
SELECT lives_ok(
  $$SELECT public.fn_set_season_tier(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'Silver', 100, NULL)$$,
  'silver tier configured');
SELECT lives_ok(
  $$SELECT public.fn_set_season_tier(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'Bronze', 0, NULL)$$,
  'bronze tier configured');
SELECT public.fn_schedule_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT throws_ok(
  $$SELECT public.fn_update_season_draft(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    '{"description": "Nope"}'::jsonb)$$,
  'P0001', 'NOT_DRAFT',
  'scheduled seasons reject draft edits');
SELECT public.fn_activate_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT is(status::text, 'active', 'season activates')
FROM public.seasons WHERE slug = 's13';
SELECT is(count(*)::int >= 2, true, 'freeze enrolls students')
FROM public.season_participants
WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
  AND participant_type = 'student';
SELECT is(count(*)::int >= 1, true, 'freeze enrolls clans')
FROM public.season_participants
WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
  AND participant_type = 'clan';

-- Overlap: GLOBAL_SINGLE blocks a second active season.
SELECT public.fn_create_season(
  (SELECT jsonb_build_object('slug', 's13b', 'name', 'Second',
    'start_at', now() - interval '1 day',
    'end_at', now() + interval '90 days')));
SELECT public.fn_schedule_season((SELECT id FROM public.seasons WHERE slug = 's13b'));
SELECT throws_ok(
  $$SELECT public.fn_activate_season(
    (SELECT id FROM public.seasons WHERE slug = 's13b'))$$,
  'P0001', 'OVERLAP_FORBIDDEN',
  'global single-active enforced');
SELECT lives_ok(
  $$SELECT public.fn_cancel_season(
    (SELECT id FROM public.seasons WHERE slug = 's13b'))$$,
  'scheduled season cancels');
SELECT throws_ok(
  $$SELECT public.fn_cancel_season(
    (SELECT id FROM public.seasons WHERE slug = 's13'))$$,
  'P0001', 'INVALID_STATE',
  'active seasons cannot cancel');

-- Join is idempotent for frozen members, open for eligibles.
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_join_season(
    (SELECT id FROM public.seasons WHERE slug = 's13'))$$,
  're-join is idempotent');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000005', 's13x@example.com');
SELECT lives_ok(
  $$SELECT public.fn_join_season(
    (SELECT id FROM public.seasons WHERE slug = 's13'))$$,
  'eligible outsiders may join');

-- ---------------------------------------------------------------------------
-- Scoring: pull-model ingest from finalized outcomes, idempotent.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com');
SELECT ok(
  public.fn_sync_season((SELECT id FROM public.seasons WHERE slug = 's13')) > 0,
  'sync ingests source outcomes');
SELECT is(
  (SELECT COALESCE(sum(points), 0)::int FROM public.season_point_events
   WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
     AND participant_type = 'student'
     AND participant_id = 'd1d1d1d1-0000-0000-0000-000000000003'),
  160, 'winner total: 100 comp + 50 boss + 10 mission');
SELECT is(
  (SELECT COALESCE(sum(points), 0)::int FROM public.season_point_events
   WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
     AND participant_type = 'student'
     AND participant_id = 'd1d1d1d1-0000-0000-0000-000000000004'),
  65, 'runner-up total: 60 comp + 5 mission');
SELECT is(
  (SELECT COALESCE(sum(points), 0)::int FROM public.season_point_events
   WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
     AND participant_type = 'clan'
     AND participant_id = (SELECT id FROM public.clans
       WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  960, 'clan total: 160 comp + 500 war + 300 boss');
SELECT public.fn_sync_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT is(
  (SELECT COALESCE(sum(points), 0)::int FROM public.season_point_events
   WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')),
  160 + 65 + 960 + 200, 're-sync never double-counts');
SELECT is(count(*)::int, 0, 'out-of-window sources ignored')
FROM public.season_point_events
WHERE source_id = 'd1d1d1d1-0000-0000-0000-000000000011';

-- Disabled sources stop ingesting (but keep history).
SELECT public.fn_set_season_source(
  (SELECT id FROM public.seasons WHERE slug = 's13'),
  'MISSION', false, '{"points": 5}'::jsonb);
SELECT public.fn_sync_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT is(
  (SELECT count(*)::int FROM public.season_point_events
   WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
     AND source_type = 'MISSION'),
  3, 'no new mission events while disabled');
SELECT public.fn_set_season_source(
  (SELECT id FROM public.seasons WHERE slug = 's13'),
  'MISSION', true, '{"points": 10, "daily_cap": 5}'::jsonb);
SELECT public.fn_sync_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT is(
  (SELECT count(*)::int FROM public.season_point_events
   WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
     AND source_type = 'MISSION'),
  3, 'daily caps stop further accrual');

-- Forged and inflated records are rejected, even by members.
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com');
SELECT is(
  public.fn_record_season_points(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'COMPETITION', 'd1d1d1d1-0000-0000-0000-000000000010', 'student',
    'd1d1d1d1-0000-0000-0000-000000000003', 9999, now()),
  false, 'inflated points rejected');
SELECT is(
  public.fn_record_season_points(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'COMPETITION', '00000000-0000-0000-0000-000000000000', 'student',
    'd1d1d1d1-0000-0000-0000-000000000003', 100, now()),
  false, 'forged sources rejected');

-- ---------------------------------------------------------------------------
-- Boards: deterministic ranks, tiers, separate contexts.
-- ---------------------------------------------------------------------------
SELECT results_eq(
  $$SELECT rank, points FROM public.fn_season_leaderboard(
    (SELECT id FROM public.seasons WHERE slug = 's13'), 'student', 10)$$,
  $$VALUES (1, 160), (2, 65)$$,
  'student board ranks by points');
SELECT results_eq(
  $$SELECT rank, points, tier FROM public.fn_season_leaderboard(
    (SELECT id FROM public.seasons WHERE slug = 's13'), 'student', 10)$$,
  $$VALUES (1, 160, 'Silver'), (2, 65, 'Bronze')$$,
  'tiers resolve from points');
SELECT results_eq(
  $$SELECT rank, points FROM public.fn_season_leaderboard(
    (SELECT id FROM public.seasons WHERE slug = 's13'), 'clan', 10)$$,
  $$VALUES (1, 960), (2, 200)$$,
  'clan board stays separate');

-- ---------------------------------------------------------------------------
-- Finalization: snapshot, rewards once, sealed history.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com');
SELECT throws_ok(
  $$SELECT public.fn_finalize_season(
    (SELECT id FROM public.seasons WHERE slug = 's13'))$$,
  'P0001', 'INVALID_STATE',
  'active seasons finalize through processing');
SELECT public.fn_advance_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT is(status::text, 'finalized', 'season finalizes')
FROM public.seasons WHERE slug = 's13';
SELECT is(count(*)::int, 2, 'student results sealed')
FROM public.season_results
WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
  AND participant_type = 'student';
SELECT is(count(*)::int, 2, 'clan honors recorded')
FROM public.season_results
WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
  AND participant_type = 'clan';
SELECT is(count(*)::int, 1, 'board snapshot stored per context')
FROM public.season_leaderboard_snapshots
WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
  AND participant_type = 'student';

SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com');
SELECT results_eq(
  $$SELECT amount FROM public.xp_ledger
    WHERE source = 'season'
      AND user_id = 'd1d1d1d1-0000-0000-0000-000000000003'$$,
  $$VALUES (500)$$,
  'winner takes first-place XP once');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com');
SELECT public.fn_advance_season((SELECT id FROM public.seasons WHERE slug = 's13'));
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000003', 's13s1@example.com');
SELECT is(count(*)::int, 1, 're-finalize never double-pays')
FROM public.xp_ledger
WHERE source = 'season'
  AND user_id = 'd1d1d1d1-0000-0000-0000-000000000003';
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 's13a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_season_adjust(
    (SELECT id FROM public.seasons WHERE slug = 's13'),
    'student', 'd1d1d1d1-0000-0000-0000-000000000003',
    '{"note": "reviewed"}'::jsonb, 'audit check')$$,
  'corrections are audited events');
SELECT is(points, 160, 'history untouched by adjustments')
FROM public.season_results
WHERE season_id = (SELECT id FROM public.seasons WHERE slug = 's13')
  AND participant_type = 'student'
  AND participant_id = 'd1d1d1d1-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Visibility and role gates.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000005', 's13x@example.com');
SELECT is(count(*)::int, 1, 'outsiders see the active season')
FROM public.seasons WHERE slug = 's13';
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 's13t@example.com');
SELECT ok(count(*)::int > 0, 'teachers read the board')
FROM public.fn_season_leaderboard(
  (SELECT id FROM public.seasons WHERE slug = 's13'), 'student', 10);
SELECT throws_ok(
  $$SELECT public.fn_finalize_season(
    '00000000-0000-0000-0000-000000000000')$$,
  'P0001', 'NOT_FOUND',
  'forged seasons rejected');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 's13t@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_season(
    (SELECT jsonb_build_object('slug', 'sx', 'name', 'X',
      'start_at', now(), 'end_at', now() + interval '1 day')))$$,
  'P0001', 'FORBIDDEN',
  'teachers cannot configure seasons');

SELECT * FROM finish();
ROLLBACK;