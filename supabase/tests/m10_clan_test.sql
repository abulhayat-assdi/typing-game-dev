-- M10 pgTAP suite: batch→clan sync, leadership, contributions, board,
-- clan missions, bounded help, visibility. BEGIN/ROLLBACK.

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
  ('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com'),
  ('d0d0d0d0-0000-0000-0000-000000000002', 'c9t@example.com'),
  ('d0d0d0d0-0000-0000-0000-000000000003', 'c9t2@example.com'),
  ('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com'),
  ('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com'),
  ('d0d0d0d0-0000-0000-0000-000000000006', 'c9s3@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com', 'Admin', 'UTC'),
  ('d0d0d0d0-0000-0000-0000-000000000002', 'c9t@example.com', 'Teacher', 'UTC'),
  ('d0d0d0d0-0000-0000-0000-000000000003', 'c9t2@example.com', 'Teacher Two', 'UTC'),
  ('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com', 'Student One', 'UTC'),
  ('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com', 'Student Two', 'UTC'),
  ('d0d0d0d0-0000-0000-0000-000000000006', 'c9s3@example.com', 'Student Three', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d0d0d0d0-0000-0000-0000-000000000001', 'super_admin'),
  ('d0d0d0d0-0000-0000-0000-000000000002', 'teacher'),
  ('d0d0d0d0-0000-0000-0000-000000000003', 'teacher'),
  ('d0d0d0d0-0000-0000-0000-000000000004', 'student'),
  ('d0d0d0d0-0000-0000-0000-000000000005', 'student'),
  ('d0d0d0d0-0000-0000-0000-000000000006', 'student');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('d0d0d0d0-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('d0d0d0d0-0000-0000-0000-000000000003',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'd0d0d0d0-0000-0000-0000-000000000004', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'd0d0d0d0-0000-0000-0000-000000000005', 'R-02', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'd0d0d0d0-0000-0000-0000-000000000006', 'R-01', 'beginner');

-- Supporter war chest for help tests (s2 spends, s1 receives).
INSERT INTO public.coin_ledger
  (user_id, amount, source, source_type, reference_id, reason, balance_after)
VALUES
  ('d0d0d0d0-0000-0000-0000-000000000005', 200, 'fixture', 'fixture',
   'fixture:c9s2', 'test funds', 200);
UPDATE public.profiles SET coin_balance = 200
WHERE id = 'd0d0d0d0-0000-0000-0000-000000000005';

INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('c9-world', 98, 'C9');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('c9-letters', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('c9c9c9c9-9999-9999-9999-999999999999', 'c9-game', 'c9-world',
   'test', 'target-press', 'letter', 'beginner', 'c9-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug = 'c9-game';

SELECT plan(46);

SET ROLE authenticated;
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com');

-- ---------------------------------------------------------------------------
-- Batch → clan synchronization.
-- ---------------------------------------------------------------------------
INSERT INTO public.batches (id, course_id, name, join_code)
SELECT 'c9c9c9c9-0000-0000-0000-000000000000', id, 'Sync Batch', 'SYNC-1'
FROM public.courses LIMIT 1;
SELECT is(count(*)::int, 1, 'new batch initializes its clan')
FROM public.clans
WHERE batch_id = 'c9c9c9c9-0000-0000-0000-000000000000';
SELECT is(organization_id, public.batch_organization_id(batch_id),
  'clan inherits the batch organization')
FROM public.clans
WHERE batch_id = 'c9c9c9c9-0000-0000-0000-000000000000';

SELECT is(m.status::text, 'active', 'batch join creates clan membership')
FROM public.clan_members m
JOIN public.clans c ON c.id = m.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND m.user_id = 'd0d0d0d0-0000-0000-0000-000000000004';

UPDATE public.batch_members SET is_active = false
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(m.status::text, 'inactive', 'batch leave closes clan membership')
FROM public.clan_members m
JOIN public.clans c ON c.id = m.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND m.user_id = 'd0d0d0d0-0000-0000-0000-000000000004';

UPDATE public.batch_members SET is_active = true
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(m.status::text, 'active', 'rejoin restores membership')
FROM public.clan_members m
JOIN public.clans c ON c.id = m.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND m.user_id = 'd0d0d0d0-0000-0000-0000-000000000004';

UPDATE public.batches SET is_active = false
WHERE id = 'c9c9c9c9-0000-0000-0000-000000000000';
SELECT is(c.status::text, 'inactive', 'batch deactivation parks the clan')
FROM public.clans c
WHERE batch_id = 'c9c9c9c9-0000-0000-0000-000000000000';
UPDATE public.batches SET is_active = true
WHERE id = 'c9c9c9c9-0000-0000-0000-000000000000';

UPDATE public.profiles SET account_status = 'suspended'
WHERE id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(count(*)::int, 0, 'suspension removes active memberships')
FROM public.clan_members
WHERE user_id = 'd0d0d0d0-0000-0000-0000-000000000004' AND status = 'active';
UPDATE public.profiles SET account_status = 'active'
WHERE id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(count(*)::int, 1, 'reactivation restores membership')
FROM public.clan_members m
JOIN public.clans c ON c.id = m.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND m.user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
  AND m.status = 'active';

-- ---------------------------------------------------------------------------
-- Leadership (audited, no self-promotion).
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_assign_clan_role(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'd0d0d0d0-0000-0000-0000-000000000004', 'leader')$$,
  'admin assigns the leader');
SELECT is(role::text, 'leader', 'leader recorded')
FROM public.clan_members m
JOIN public.clans c ON c.id = m.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND m.user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT lives_ok(
  $$SELECT public.fn_assign_clan_role(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'd0d0d0d0-0000-0000-0000-000000000005', 'leader')$$,
  'leadership transfers');
SELECT is(role::text, 'member', 'previous leader demoted')
FROM public.clan_members m
JOIN public.clans c ON c.id = m.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND m.user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(count(*)::int, 2, 'leadership changes audited')
FROM public.clan_leadership_audit a
JOIN public.clans c ON c.id = a.clan_id
WHERE c.batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_assign_clan_role(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'd0d0d0d0-0000-0000-0000-000000000004', 'leader')$$,
  'P0001', 'FORBIDDEN',
  'students cannot promote themselves');

-- ---------------------------------------------------------------------------
-- Contributions (derived) + roster + board.
-- ---------------------------------------------------------------------------
SELECT public.fn_start_attempt('c9-game', 'beginner', 'c9a', 'C9 run one', 900) AS c9a1 \gset
SELECT public.fn_submit_attempt(
  :'c9a1', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT is(count(*)::int, 1, 'validated attempt mints one contribution')
FROM public.clan_contributions
WHERE user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(points >= 1, true, 'contribution follows the rule floor')
FROM public.clan_contributions
WHERE user_id = 'd0d0d0d0-0000-0000-0000-000000000004';

SELECT public.fn_start_attempt('c9-game', 'beginner', 'c9b', 'C9 bad run', 900) AS c9b1 \gset
SELECT public.fn_submit_attempt(
  :'c9b1', '{"totalCharacters":40}'::jsonb, 70, 95, 10, false);
SELECT is(count(*)::int, 1, 'rejected attempts contribute nothing')
FROM public.clan_contributions
WHERE user_id = 'd0d0d0d0-0000-0000-0000-000000000004';

SELECT results_eq(
  $$SELECT display_name, member_role::text FROM public.fn_clan_roster(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))
    ORDER BY contribution DESC, display_name ASC
    LIMIT 1$$,
  $$VALUES ('Student One', 'member')$$,
  'roster exposes safe member rows');
SELECT is(count(*)::int, 1, 'board ranks the clan')
FROM public.fn_clan_board('all', 20)
WHERE clan_id = (SELECT id FROM public.clans
                 WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Second member plays so clan missions have two contributors.
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com');
SELECT public.fn_start_attempt('c9-game', 'beginner', 'c9c', 'C9 run two', 900) AS c9c1 \gset
SELECT public.fn_submit_attempt(
  :'c9c1', '{"totalCharacters":40}'::jsonb, 60, 90, 10, true);

-- ---------------------------------------------------------------------------
-- Clan missions reuse M9 definitions over member activity.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com');
SELECT throws_ok(
  $$SELECT public.fn_link_clan_mission(
    (SELECT id FROM public.missions WHERE slug = 'm-daily-games'),
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))$$,
  'P0001', 'NOT_CLAN_MISSION',
  'personal missions cannot link as clan runs');
SELECT lives_ok(
  $$SELECT public.fn_create_mission('{
    "slug": "c-clan-games", "title": "Clan Expedition",
    "category": "CLAN", "objective_type": "GAMES_COMPLETED",
    "target": {"count": 2}, "reward_profile": {"xp": 40, "coins": 4}}'::jsonb)$$,
  'admin creates a clan mission');
SELECT public.fn_set_mission_status(
  (SELECT id FROM public.missions WHERE slug = 'c-clan-games'), 'active');
SELECT public.fn_link_clan_mission(
  (SELECT id FROM public.missions WHERE slug = 'c-clan-games'),
  (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
) AS ccm \gset

SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_start_clan_mission(
    (SELECT cm.id FROM public.clan_missions cm
     JOIN public.missions m ON m.id = cm.mission_id
     WHERE m.slug = 'c-clan-games'))$$,
  'P0001', 'FORBIDDEN',
  'members cannot start clan missions');
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_start_clan_mission(
    (SELECT cm.id FROM public.clan_missions cm
     JOIN public.missions m ON m.id = cm.mission_id
     WHERE m.slug = 'c-clan-games'))$$,
  'admin starts the clan run');
SELECT is(status::text, 'active', 'partial progress keeps it active')
FROM public.clan_missions WHERE id = :'ccm';
SELECT public.fn_sync_clan_mission(:'ccm');
SELECT is(status::text, 'completed', 'member games complete the run')
FROM public.clan_missions WHERE id = :'ccm';
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT is(count(*)::int, 1, 'first contributor rewarded once')
FROM public.xp_ledger
WHERE source = 'clan_mission'
  AND user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com');
SELECT is(count(*)::int, 1, 'second contributor rewarded once')
FROM public.xp_ledger
WHERE source = 'clan_mission'
  AND user_id = 'd0d0d0d0-0000-0000-0000-000000000005';
SELECT public.fn_sync_clan_mission(:'ccm');
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT is(count(*)::int, 1, 'resync never double-pays')
FROM public.xp_ledger
WHERE source = 'clan_mission'
  AND user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SELECT is(count(*)::int, 1, 'completion event recorded')
FROM public.clan_mission_completion_events
WHERE clan_id = (SELECT id FROM public.clans
                 WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ---------------------------------------------------------------------------
-- Bounded help: coin cost, capped XP, no self-dealing.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_create_help_request(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{"unlock": "Word Dragon"}'::jsonb, 30, 48)$$,
  'member opens a help request');
SELECT throws_ok(
  $$SELECT public.fn_create_help_request(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{}'::jsonb, 10, 48)$$,
  'P0001', 'ALREADY_OPEN',
  'one open request per member');
SELECT throws_ok(
  $$SELECT public.fn_create_help_request(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{}'::jsonb, 51, 48)$$,
  'P0001', 'MALFORMED',
  'per-request maximum enforced');

SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000002', 'c9t@example.com');
SELECT throws_ok(
  $$SELECT public.fn_contribute_help(
    (SELECT id FROM public.clan_help_requests
     WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
     ORDER BY created_at DESC LIMIT 1), 10)$$,
  'P0001', 'CROSS_CLAN',
  'non-member staff cannot contribute');
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_contribute_help(
    (SELECT id FROM public.clan_help_requests
     WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
     ORDER BY created_at DESC LIMIT 1), 10)$$,
  'P0001', 'SELF_FULFILL',
  'requesters cannot fund themselves');

SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com');
SELECT lives_ok(
  $$SELECT public.fn_contribute_help(
    (SELECT id FROM public.clan_help_requests
     WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
     ORDER BY created_at DESC LIMIT 1), 20)$$,
  'clanmate contributes');
SELECT is(status::text, 'partially_fulfilled', 'partial state tracked')
FROM public.clan_help_requests
WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
ORDER BY created_at DESC LIMIT 1;
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000004', 'c9s1@example.com');
SELECT results_eq(
  $$SELECT amount FROM public.xp_ledger
    WHERE source = 'clan_help'
      AND user_id = 'd0d0d0d0-0000-0000-0000-000000000004'$$,
  $$VALUES (20)$$,
  'bounded assistance lands as XP');
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com');
SELECT throws_ok(
  $$SELECT public.fn_contribute_help(
    (SELECT id FROM public.clan_help_requests
     WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
     ORDER BY created_at DESC LIMIT 1), 5)$$,
  'P0001', 'DUPLICATE',
  'one contribution per supporter');
SELECT is(coin_balance, 184, 'supporter paid 20, earned 4 mission coins')
FROM public.profiles
WHERE id = 'd0d0d0d0-0000-0000-0000-000000000005';

-- Expiry closes stale requests (backdate as the database owner).
RESET ROLE;
UPDATE public.clan_help_requests SET expires_at = now() - interval '1 hour'
WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004';
SET ROLE authenticated;
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_assign_clan_role(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'd0d0d0d0-0000-0000-0000-000000000005', 'co_leader')$$,
  'co-leader assigned for expiry-path coverage');
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000005', 'c9s2@example.com');
SELECT throws_ok(
  $$SELECT public.fn_contribute_help(
    (SELECT id FROM public.clan_help_requests
     WHERE requester_user_id = 'd0d0d0d0-0000-0000-0000-000000000004'
     ORDER BY created_at DESC LIMIT 1), 5)$$,
  'P0001', 'CLOSED',
  'expired requests refuse contributions');

-- ---------------------------------------------------------------------------
-- Visibility + audit trail.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000006', 'c9s3@example.com');
SELECT is(count(*)::int, 0, 'unrelated students see no foreign clan')
FROM public.clans
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(count(*)::int, 0, 'unrelated students see no foreign help')
FROM public.clan_help_requests
WHERE clan_id = (SELECT id FROM public.clans
                 WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000002', 'c9t@example.com');
SELECT is(count(*)::int, 1, 'batch teacher sees the clan')
FROM public.clans
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000003', 'c9t2@example.com');
SELECT is(count(*)::int, 0, 'out-of-batch teachers see nothing')
FROM public.clans
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT tests.set_claims('d0d0d0d0-0000-0000-0000-000000000001', 'c9a@example.com');
SELECT is(count(*)::int, 1, 'admins see every clan')
FROM public.clans
WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT ok(count(*)::int > 0, 'joins, missions and help are logged')
FROM public.clan_activity
WHERE clan_id = (SELECT id FROM public.clans
                 WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SELECT * FROM finish();
ROLLBACK;
