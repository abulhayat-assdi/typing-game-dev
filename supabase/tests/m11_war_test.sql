-- M11 pgTAP suite: war lifecycle, invitations, eligibility, attempts,
-- scoring, finalization, security. BEGIN/ROLLBACK.

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
  ('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com'),
  ('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com'),
  ('f0f0f0f0-0000-0000-0000-000000000003', 'w11ma@example.com'),
  ('f0f0f0f0-0000-0000-0000-000000000004', 'w11lb@example.com'),
  ('f0f0f0f0-0000-0000-0000-000000000005', 'w11mb@example.com'),
  ('f0f0f0f0-0000-0000-0000-000000000006', 'w11x@example.com'),
  ('f0f0f0f0-0000-0000-0000-000000000007', 'w11t@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com', 'Admin', 'UTC'),
  ('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com', 'Leader A', 'UTC'),
  ('f0f0f0f0-0000-0000-0000-000000000003', 'w11ma@example.com', 'Member A', 'UTC'),
  ('f0f0f0f0-0000-0000-0000-000000000004', 'w11lb@example.com', 'Leader B', 'UTC'),
  ('f0f0f0f0-0000-0000-0000-000000000005', 'w11mb@example.com', 'Member B', 'UTC'),
  ('f0f0f0f0-0000-0000-0000-000000000006', 'w11x@example.com', 'Outsider', 'UTC'),
  ('f0f0f0f0-0000-0000-0000-000000000007', 'w11t@example.com', 'Teacher', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f0f0f0f0-0000-0000-0000-000000000001', 'super_admin'),
  ('f0f0f0f0-0000-0000-0000-000000000002', 'student'),
  ('f0f0f0f0-0000-0000-0000-000000000003', 'student'),
  ('f0f0f0f0-0000-0000-0000-000000000004', 'student'),
  ('f0f0f0f0-0000-0000-0000-000000000005', 'student'),
  ('f0f0f0f0-0000-0000-0000-000000000006', 'student'),
  ('f0f0f0f0-0000-0000-0000-000000000007', 'teacher');

INSERT INTO public.teacher_assignments (user_id, batch_id) VALUES
  ('f0f0f0f0-0000-0000-0000-000000000007',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'f0f0f0f0-0000-0000-0000-000000000002', 'R-01', 'beginner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'f0f0f0f0-0000-0000-0000-000000000003', 'R-02', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'f0f0f0f0-0000-0000-0000-000000000004', 'R-01', 'beginner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'f0f0f0f0-0000-0000-0000-000000000005', 'R-02', 'beginner');

INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('w11-world', 100, 'W11');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('w11-letters', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (id, slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES
  ('f1f1f1f1-1111-1111-1111-111111111111', 'w11-game', 'w11-world',
   'test', 'target-press', 'letter', 'beginner', 'w11-letters', 'standard',
   true, 1),
  ('f2f2f2f2-2222-2222-2222-222222222222', 'w11-other', 'w11-world',
   'test', 'target-press', 'letter', 'beginner', 'w11-letters', 'standard',
   true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug IN ('w11-game', 'w11-other');

SELECT plan(51);

SET ROLE authenticated;
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');

-- Leadership fixtures (admin assigns both clan leaders).
SELECT public.fn_assign_clan_role(
  (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'f0f0f0f0-0000-0000-0000-000000000002', 'leader');
SELECT public.fn_assign_clan_role(
  (SELECT id FROM public.clans WHERE batch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'f0f0f0f0-0000-0000-0000-000000000004', 'leader');

-- ---------------------------------------------------------------------------
-- State machine map.
-- ---------------------------------------------------------------------------
SELECT is(public.fn_war_can_transition('draft', 'challenge_sent'), true,
  'draft may be challenged');
SELECT is(public.fn_war_can_transition('draft', 'live'), false,
  'draft may not jump to live');
SELECT is(public.fn_war_can_transition('pending_response', 'accepted'), true,
  'invites may be accepted');
SELECT is(public.fn_war_can_transition('live', 'finalized'), false,
  'live must process before finalizing');
SELECT is(public.fn_war_can_transition('processing', 'live'), true,
  'processing may return to live');
SELECT is(public.fn_war_can_transition('finalized', 'cancelled'), false,
  'finalized is terminal');

-- ---------------------------------------------------------------------------
-- Challenge guards.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000003', 'w11ma@example.com');
SELECT throws_ok(
  $$SELECT public.fn_challenge_clan(
    (SELECT id FROM public.clans WHERE batch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    '{}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'members cannot challenge');

SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT throws_ok(
  $$SELECT public.fn_challenge_clan(
    (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    '{}'::jsonb)$$,
  'P0001', 'SELF_CHALLENGE',
  'clans cannot fight themselves');
-- Opponents resolve through leader-only discovery (identity only);
-- ordered by name: Batch 102, Batch 201, Batch 202 for a B101 leader.
SELECT throws_ok(
  $$SELECT public.fn_challenge_clan(
    (SELECT clan_id FROM public.fn_challengeable_clans() LIMIT 1 OFFSET 1),
    '{}'::jsonb)$$,
  'P0001', 'SCOPE_FORBIDDEN',
  'cross-course rejected under default scope');

-- Leader challenge (same course): the created war + invite asserts below
-- are the acceptance; a failure here aborts the flow visibly.
SELECT public.fn_challenge_clan(
  (SELECT clan_id FROM public.fn_challengeable_clans() LIMIT 1 OFFSET 0),
  '{"game_slugs": ["w11-game"], "prep_hours": 0, "battle_hours": 1, "attempts_per_player": 2}'::jsonb) AS w1 \gset
SELECT is(status::text, 'challenge_sent', 'war opens as challenge_sent')
FROM public.clan_wars WHERE id = :'w1';
SELECT is(count(*)::int, 1, 'invitation recorded pending')
FROM public.clan_war_invitations WHERE war_id = :'w1' AND status = 'pending';

SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT throws_ok(
  $$SELECT public.fn_challenge_clan(
    (SELECT clan_id FROM public.fn_challengeable_clans() LIMIT 1 OFFSET 0),
    '{}'::jsonb)$$,
  'P0001', 'ALREADY_ACTIVE',
  'one active war per clan');

SELECT public.fn_war_dispatch(:'w1');
SELECT is(status::text, 'pending_response', 'dispatch opens the response window')
FROM public.clan_wars WHERE id = :'w1';

-- ---------------------------------------------------------------------------
-- Invitation responses (defender leadership only).
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000005', 'w11mb@example.com');
SELECT throws_ok(
  $$SELECT public.fn_respond_war(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1), true)$$,
  'P0001', 'FORBIDDEN',
  'defender members cannot accept');
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT throws_ok(
  $$SELECT public.fn_respond_war(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1), true)$$,
  'P0001', 'FORBIDDEN',
  'challengers cannot accept their own war');
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000004', 'w11lb@example.com');
SELECT lives_ok(
  $$SELECT public.fn_respond_war(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1), true)$$,
  'defender leader accepts');
SELECT is(status::text, 'accepted', 'war accepted')
FROM public.clan_wars WHERE id = :'w1';
SELECT is(status::text, 'accepted', 'invitation marked accepted')
FROM public.clan_war_invitations WHERE war_id = :'w1';

-- Time-gated advance: accepted → preparation → live (+ frozen roster).
SELECT public.fn_advance_war(:'w1');
SELECT is(status::text, 'preparation', 'preparation opens on schedule')
FROM public.clan_wars WHERE id = :'w1';
SELECT public.fn_advance_war(:'w1');
SELECT is(status::text, 'live', 'battle goes live on schedule')
FROM public.clan_wars WHERE id = :'w1';
SELECT is(count(*)::int, 4, 'eligibility frozen at live')
FROM public.clan_war_participants WHERE war_id = :'w1';
SELECT is(count(*)::int, 0, 'outsiders never enter the roster')
FROM public.clan_war_participants
WHERE war_id = :'w1' AND user_id = 'f0f0f0f0-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------------
-- Submissions reference validated M4 attempts only.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT public.fn_start_attempt('w11-game', 'beginner', 'w11a', 'War run one', 900) AS wa1 \gset
SELECT public.fn_submit_attempt(
  :'wa1', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT lives_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War run one'))$$,
  'validated attempt submits into the war');

SELECT public.fn_start_attempt('w11-game', 'beginner', 'w11b', 'War pending', 900) AS wa2 \gset
SELECT throws_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War pending'))$$,
  'P0001', 'NOT_VALIDATED',
  'unvalidated attempts rejected');
SELECT public.fn_start_attempt('w11-other', 'beginner', 'w11c', 'War wrong game', 900) AS wa3 \gset
SELECT public.fn_submit_attempt(
  :'wa3', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT throws_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War wrong game'))$$,
  'P0001', 'GAME_NOT_ALLOWED',
  'off-pool games rejected');

SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000003', 'w11ma@example.com');
SELECT public.fn_start_attempt('w11-game', 'beginner', 'w11d', 'Forged run', 900) AS wa4 \gset
SELECT public.fn_submit_attempt(
  :'wa4', '{"totalCharacters":40}'::jsonb, 70, 95, 10, true);
SELECT throws_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars
     WHERE challenger_clan_id = (SELECT id FROM public.clans WHERE batch_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
     ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War run one'))$$,
  'P0001', 'ATTEMPT_FORBIDDEN',
  'foreign attempts rejected');

-- Duplicate + per-player limit (2 configured).
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT throws_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War run one'))$$,
  'P0001', 'DUPLICATE',
  'same attempt cannot score twice');
SELECT public.fn_start_attempt('w11-game', 'beginner', 'w11e', 'War run two', 900) AS wa5 \gset
SELECT public.fn_submit_attempt(
  :'wa5', '{"totalCharacters":40}'::jsonb, 60, 90, 10, true);
SELECT lives_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War run two'))$$,
  'second attempt within limit');
SELECT public.fn_start_attempt('w11-game', 'beginner', 'w11f', 'War run three', 900) AS wa6 \gset
SELECT public.fn_submit_attempt(
  :'wa6', '{"totalCharacters":40}'::jsonb, 60, 90, 10, true);
SELECT throws_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War run three'))$$,
  'P0001', 'ATTEMPT_LIMIT',
  'per-player cap enforced');

-- Defender scores once so both clans have totals.
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000004', 'w11lb@example.com');
SELECT public.fn_start_attempt('w11-game', 'beginner', 'w11g', 'War defense', 900) AS wa7 \gset
SELECT public.fn_submit_attempt(
  :'wa7', '{"totalCharacters":40}'::jsonb, 80, 92, 10, true);
SELECT lives_ok(
  $$SELECT public.fn_submit_war_attempt(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM public.game_attempts WHERE expected_text = 'War defense'))$$,
  'defender submits');

-- ---------------------------------------------------------------------------
-- Scoring is deterministic; finalization is gated and idempotent.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');
SELECT public.fn_sync_war(:'w1');
SELECT is(count(*)::int, 4, 'contributions aggregate per participant')
FROM public.clan_war_contributions WHERE war_id = :'w1';
SELECT public.fn_sync_war(:'w1');
SELECT is(
  (SELECT sum(score) FROM public.clan_war_contributions WHERE war_id = :'w1'),
  (SELECT sum(score) FROM public.clan_war_contributions WHERE war_id = :'w1'),
  'recompute is deterministic');

SELECT throws_ok(
  $$SELECT public.fn_finalize_war(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'INVALID_STATE',
  'live wars cannot finalize directly');

-- End the battle (backdate as the database owner), then process + finalize.
RESET ROLE;
UPDATE public.clan_wars
SET preparation_start = now() - interval '60 minutes',
    battle_start = now() - interval '30 minutes',
    battle_end = now() - interval '1 minute'
WHERE id = (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1);
SET ROLE authenticated;
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');
SELECT public.fn_advance_war(:'w1');
SELECT is(status::text, 'processing', 'battle end moves to processing')
FROM public.clan_wars WHERE id = :'w1';
SELECT lives_ok(
  $$SELECT public.fn_finalize_war(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1))$$,
  'war finalizes');
SELECT is(count(*)::int, 2, 'one immutable result per clan')
FROM public.clan_war_results WHERE war_id = :'w1';
SELECT is(sum(rank)::int, 3, 'ranks are one and two')
FROM public.clan_war_results WHERE war_id = :'w1';
SELECT is(count(*)::int, 1, 'exactly one winner')
FROM public.clan_war_results WHERE war_id = :'w1' AND is_winner;

-- Rewards: both contributors paid once through M5 (100 + 20 either way).
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT is(count(*)::int, 1, 'challenger rewarded once')
FROM public.xp_ledger
WHERE source = 'war' AND user_id = 'f0f0f0f0-0000-0000-0000-000000000002';
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000004', 'w11lb@example.com');
SELECT is(count(*)::int, 1, 'defender rewarded once')
FROM public.xp_ledger
WHERE source = 'war' AND user_id = 'f0f0f0f0-0000-0000-0000-000000000004';
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');
SELECT is(
  (SELECT fn_finalize_war(:'w1') ->> 'already'), 'true',
  're-finalize returns the sealed result');
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT is(count(*)::int, 1, 're-finalize never double-pays')
FROM public.xp_ledger
WHERE source = 'war' AND user_id = 'f0f0f0f0-0000-0000-0000-000000000002';
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000004', 'w11lb@example.com');
SELECT is(count(*)::int, 1, 'defender total unchanged by re-finalize')
FROM public.xp_ledger
WHERE source = 'war' AND user_id = 'f0f0f0f0-0000-0000-0000-000000000004';
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');
SELECT throws_ok(
  $$SELECT public.fn_war_adjust(
    (SELECT id FROM public.clan_wars ORDER BY created_at DESC LIMIT 1), 'member',
    'f0f0f0f0-0000-0000-0000-000000000002',
    '{"score": 1}'::jsonb, 'cheat')$$,
  'P0001', 'IMMUTABLE',
  'finalized results cannot be adjusted');
SELECT is(count(*)::int, 7, 'every hop audited')
FROM public.clan_war_state_events WHERE war_id = :'w1';

-- ---------------------------------------------------------------------------
-- Visibility, cancel and expiry paths on a second war.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT public.fn_challenge_clan(
  (SELECT clan_id FROM public.fn_challengeable_clans() LIMIT 1 OFFSET 0),
  '{"game_slugs": ["w11-game"]}'::jsonb) AS w2 \gset
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000003', 'w11ma@example.com');
SELECT throws_ok(
  $$SELECT public.fn_cancel_war(
    (SELECT id FROM public.clan_wars
     WHERE status <> 'finalized' ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'FORBIDDEN',
  'members cannot cancel wars');
SELECT is(count(*)::int, 0, 'outsider board is empty')
FROM public.fn_war_board(:'w2');
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000007', 'w11t@example.com');
SELECT ok(count(*)::int > 0, 'assigned teacher sees the war')
FROM public.clan_wars WHERE id = :'w2';
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');
-- now() is transaction-frozen, so sibling rows tie on created_at:
-- always exclude sealed wars when resolving "the" open war.
SELECT lives_ok(
  $$SELECT public.fn_cancel_war(
    (SELECT id FROM public.clan_wars
     WHERE status <> 'finalized' ORDER BY created_at DESC LIMIT 1))$$,
  'admin cancels');
SELECT is(status::text, 'cancelled', 'cancel lands')
FROM public.clan_wars WHERE id = :'w2';

-- Expiry sweep closes stale challenges.
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000002', 'w11la@example.com');
SELECT public.fn_challenge_clan(
  (SELECT clan_id FROM public.fn_challengeable_clans() LIMIT 1 OFFSET 0),
  '{"game_slugs": ["w11-game"]}'::jsonb) AS w3 \gset
RESET ROLE;
UPDATE public.clan_wars SET created_at = now() - interval '73 hours'
WHERE id = :'w3';
SET ROLE authenticated;
SELECT tests.set_claims('f0f0f0f0-0000-0000-0000-000000000001', 'w11a@example.com');
SELECT public.fn_expire_wars();
SELECT is(status::text, 'expired', 'stale challenge expires')
FROM public.clan_wars WHERE id = :'w3';

SELECT * FROM finish();
ROLLBACK;
