-- M17 pgTAP suite: rewarded-ad sessions, verification, exactly-once
-- grants, limits, streak recovery, admin policy, security.
-- BEGIN/ROLLBACK. Harness: bootstrap → migrations → seed → this file.

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
  ('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com'),
  ('d1d1d1d1-0000-0000-0000-000000000003', 'r17s2@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com', 'Admin', 'UTC'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com', 'Student One', 'UTC'),
  ('d1d1d1d1-0000-0000-0000-000000000003', 'r17s2@example.com', 'Student Two', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'super_admin'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'student'),
  ('d1d1d1d1-0000-0000-0000-000000000003', 'student');

-- Shop fixture for item grants + a lapsed streak for recovery.
-- (Owner bypass; the shop's own admin fns are covered in M16.)
RESET ROLE;
INSERT INTO public.shop_items
  (slug, name, category, item_type, price_coins, max_own,
   consumable, equippable, effect, is_active)
VALUES ('retry-token', 'Retry Token', 'utility', 'utility', 30, 5,
  true, false, 'retry_credit', true)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.streaks
  (user_id, current_count, best_count, last_active_date, active_days)
VALUES ('d1d1d1d1-0000-0000-0000-000000000002', 6, 9,
  CURRENT_DATE - 2, 6)
ON CONFLICT (user_id) DO UPDATE SET
  current_count = 6, best_count = 9,
  last_active_date = CURRENT_DATE - 2, active_days = 6;

SELECT plan(41);

SET ROLE authenticated;
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');

-- ---------------------------------------------------------------------------
-- Gates: fail closed until flags + policy enable the flow.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'retry-token')$$,
  'P0001', 'DISABLED',
  'offers fail closed by default');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_set_rewarded_flag('REWARDED_ADS_ENABLED', true)$$,
  'admin enables the master flag');
SELECT throws_ok(
  $$SELECT public.fn_set_rewarded_flag('EVIL_FLAG', true)$$,
  'P0001', 'MALFORMED',
  'flag allow-list enforced');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_set_rewarded_flag('REWARDED_ADS_ENABLED', true)$$,
  'P0001', 'FORBIDDEN',
  'students cannot touch flags');
SELECT throws_ok(
  $$SELECT public.fn_set_rewarded_policy('{"enabled": true}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'students cannot tune policy');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_set_rewarded_policy(
    '{"enabled": true, "provider": "mock", "mock_allowed": true,
      "daily_limit": 50, "cooldown_minutes": 0,
      "max_rewards_per_day": 50}'::jsonb)$$,
  'admin enables the mock flow');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'no-such-reward')$$,
  'P0001', 'INVALID_REWARD',
  'arbitrary rewards rejected');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'welcome-frame')$$,
  'P0001', 'INVALID_REWARD',
  'disabled rewards rejected');

-- ---------------------------------------------------------------------------
-- Full mock loop: offer → opt-in → start → complete → verify → grant.
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'retry-token')$$,
  'eligible offer creates a session');
SELECT is(status, 'offered', 'session starts offered')
FROM public.rewarded_ad_sessions
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
ORDER BY created_at DESC LIMIT 1;
SELECT lives_ok(
  $$SELECT public.fn_rewarded_opt_in(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1))$$,
  'explicit opt-in works');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_verify(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'INVALID_STATE',
  'verify before completion rejected');
SELECT ok(
  public.fn_rewarded_start(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1)) LIKE 'mock:%',
  'start issues a provider reference');
SELECT is(
  public.fn_rewarded_complete(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1),
    '{"provider_reference": "mock:forged"}'::jsonb),
  'forged',
  'forged provider references rejected without reward');
SELECT is(
  public.fn_rewarded_complete(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1),
    (SELECT jsonb_build_object('provider_reference', provider_reference)
     FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1)),
  'completed',
  'genuine provider event completes');
SELECT is(
  public.fn_rewarded_verify(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1)),
  'verified',
  'server verification passes');
SELECT ok(
  public.fn_rewarded_grant(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     ORDER BY created_at DESC LIMIT 1)) IS NOT NULL,
  'verified session grants once');
SELECT is(quantity, 1, 'retry token lands in inventory')
FROM public.shop_inventory
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'retry-token');
SELECT is(count(*)::int, 1, 'grant audit row exists')
FROM public.item_grants
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
  AND reason = 'rewarded_ad';
SELECT is(
  public.fn_rewarded_grant(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'rewarded'
     ORDER BY created_at DESC LIMIT 1)),
  (SELECT id::text FROM public.rewarded_ad_grants
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
   ORDER BY created_at DESC LIMIT 1),
  'duplicate grant returns the original');
SELECT is(quantity, 1, 'duplicate grant adds nothing')
FROM public.shop_inventory
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'retry-token');

-- ---------------------------------------------------------------------------
-- Abuse controls: cooldown, daily cap, expiry, cancel, wrong user.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy('{"cooldown_minutes": 60}'::jsonb);
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'retry-token')$$,
  'P0001', 'COOLDOWN',
  'cooldown blocks immediate repeats');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy(
  '{"cooldown_minutes": 0, "daily_limit": 1}'::jsonb);
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'retry-token')$$,
  'P0001', 'DAILY_LIMIT',
  'daily limit enforced server-side');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy(
  '{"daily_limit": 50, "max_rewards_per_day": 50}'::jsonb);
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT lives_ok(
  $$SELECT public.fn_rewarded_offer('game_fail', 'retry-token')$$,
  'offer for the expiry path');
SELECT lives_ok(
  $$SELECT public.fn_rewarded_cancel(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'offered'
     ORDER BY created_at DESC LIMIT 1))$$,
  'decline cancels without penalty');
SELECT is(count(*)::int >= 1, true, 'decline tracked')
FROM public.rewarded_ad_events
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
  AND event = 'user_declined';
SELECT public.fn_rewarded_offer('game_fail', 'retry-token');
RESET ROLE;
UPDATE public.rewarded_ad_sessions SET expires_at = now() - interval '1 minute'
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002' AND status = 'offered'
  AND id = (SELECT id FROM public.rewarded_ad_sessions
            WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
              AND status = 'offered'
            ORDER BY created_at DESC LIMIT 1);
SET ROLE authenticated;
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT is(
  public.fn_rewarded_opt_in(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'offered'
     ORDER BY created_at DESC LIMIT 1)),
  'expired',
  'expired sessions rejected and parked');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000003', 'r17s2@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_opt_in(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'offered'
     ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'NOT_FOUND',
  'cross-user sessions invisible');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_grant(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'offered'
     ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'NOT_FOUND',
  'cross-user grants blocked');

-- ---------------------------------------------------------------------------
-- Google fail-closed: no verifiable callback exists, nothing granted.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy('{"provider": "google_offerwall"}'::jsonb);
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT public.fn_rewarded_offer('practice', 'retry-token');
SELECT public.fn_rewarded_opt_in(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'offered' ORDER BY created_at DESC LIMIT 1));
SELECT public.fn_rewarded_start(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'opted_in' ORDER BY created_at DESC LIMIT 1));
SELECT is(
  public.fn_rewarded_complete(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'started' ORDER BY created_at DESC LIMIT 1),
    '{"provider_reference": "offerwall:anything"}'::jsonb),
  'unverifiable',
  'google completions fail closed without a documented hook');
SELECT is(status, 'failed', 'unverifiable session parked failed')
FROM public.rewarded_ad_sessions
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
  AND provider = 'google_offerwall'
ORDER BY created_at DESC LIMIT 1;
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy('{"provider": "mock"}'::jsonb);

-- ---------------------------------------------------------------------------
-- Streak recovery: bounded state repair, zero manufactured activity.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT public.fn_rewarded_offer('practice', 'streak-recovery-1d');
SELECT public.fn_rewarded_opt_in(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'offered' ORDER BY created_at DESC LIMIT 1));
SELECT public.fn_rewarded_start(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'opted_in' ORDER BY created_at DESC LIMIT 1));
SELECT public.fn_rewarded_complete(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'started' ORDER BY created_at DESC LIMIT 1),
  (SELECT jsonb_build_object('provider_reference', provider_reference)
   FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'started' ORDER BY created_at DESC LIMIT 1));
SELECT public.fn_rewarded_verify(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'completed' ORDER BY created_at DESC LIMIT 1));
SELECT ok(
  public.fn_rewarded_grant(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'verified' ORDER BY created_at DESC LIMIT 1)) IS NOT NULL,
  'recovery grant succeeds once');
SELECT is(last_active_date, CURRENT_DATE - 1, 'streak state repaired forward')
FROM public.streaks
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002';
SELECT is(count(*)::int, 1, 'recovery audited per date')
FROM public.streak_recoveries
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002';
SELECT is(count(*)::int, 0, 'no manufactured activity rows')
FROM public.streak_events
WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- Coins stay disabled until explicitly approved (policy decision).
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.rewarded_ad_reward_definitions (slug, kind, ref, amount, enabled)
VALUES ('ad-coins', 'coins', '', 10, true)
ON CONFLICT (slug) DO NOTHING;
SET ROLE authenticated;
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_offer('practice', 'ad-coins')$$,
  'P0001', 'INVALID_REWARD',
  'coin offers fail fast while unapproved');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy('{"allow_coin_rewards": true}'::jsonb);
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT public.fn_rewarded_offer('practice', 'ad-coins');
SELECT public.fn_rewarded_opt_in(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'offered' ORDER BY created_at DESC LIMIT 1));
SELECT public.fn_rewarded_start(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'opted_in' ORDER BY created_at DESC LIMIT 1));
SELECT public.fn_rewarded_complete(
  (SELECT id FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'started' ORDER BY created_at DESC LIMIT 1),
  (SELECT jsonb_build_object('provider_reference', provider_reference)
   FROM public.rewarded_ad_sessions
   WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
     AND status = 'started' ORDER BY created_at DESC LIMIT 1));
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT public.fn_set_rewarded_policy('{"allow_coin_rewards": false}'::jsonb);
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT is(
  public.fn_rewarded_verify(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'completed' ORDER BY created_at DESC LIMIT 1)),
  'denied:INVALID_REWARD',
  'coin rewards denied while unapproved');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_grant(
    (SELECT id FROM public.rewarded_ad_sessions
     WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000002'
       AND status = 'failed' ORDER BY created_at DESC LIMIT 1))$$,
  'P0001', 'INVALID_STATE',
  'denied sessions cannot grant');

-- ---------------------------------------------------------------------------
-- Admin analytics + sweep.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000001', 'r17a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_rewarded_funnel()$$,
  'admin funnel works');
SELECT tests.set_claims('d1d1d1d1-0000-0000-0000-000000000002', 'r17s1@example.com');
SELECT throws_ok(
  $$SELECT public.fn_rewarded_funnel()$$,
  'P0001', 'FORBIDDEN',
  'students cannot see the funnel');
SELECT lives_ok(
  $$SELECT public.fn_rewarded_sweep()$$,
  'sweep runs');

SELECT * FROM finish();
ROLLBACK;
