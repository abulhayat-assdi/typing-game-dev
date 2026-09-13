-- M17 rewarded-ads operations: server-controlled sessions, strict
-- transitions, provider verification (mock HMAC-equivalent checks;
-- Google fail-closed), exactly-once grants through M5/shop rails,
-- configurable abuse limits, streak recovery without manufacturing
-- history, admin policy, funnel analytics.

CREATE OR REPLACE FUNCTION public.fn_rewarded_can_transition(
  p_from text, p_to text
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = 'offered' THEN p_to IN ('opted_in', 'cancelled', 'expired')
    WHEN p_from = 'opted_in' THEN p_to IN ('started', 'cancelled', 'expired')
    WHEN p_from = 'started' THEN
      p_to IN ('completed', 'failed', 'expired', 'cancelled')
    WHEN p_from = 'completed' THEN p_to IN ('verified', 'failed', 'expired')
    WHEN p_from = 'verified' THEN p_to IN ('rewarded', 'failed')
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.fn_log_rewarded(
  p_session uuid, p_user uuid, p_action text, p_details jsonb
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.rewarded_ad_audit (session_id, user_id, action, details)
  VALUES (p_session, p_user, p_action, COALESCE(p_details, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.fn_track_rewarded(
  p_session uuid, p_user uuid, p_event text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.rewarded_ad_events (session_id, user_id, event)
  VALUES (p_session, p_user, p_event);
$$;

CREATE OR REPLACE FUNCTION public.fn_rewarded_policy()
RETURNS public.rewarded_ad_policy
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.rewarded_ad_policy WHERE id = 0;
$$;

CREATE OR REPLACE FUNCTION public.fn_rewarded_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.feature_flags
     WHERE key = 'REWARDED_ADS_ENABLED'), false);
$$;

-- ---------------------------------------------------------------------------
-- Offer: eligibility is decided here (flags, reward allow-list, daily
-- limits, cooldown). The browser only renders what the server offers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rewarded_offer(
  p_placement text, p_reward_slug text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_pol public.rewarded_ad_policy;
  v_def record;
  v_today int;
  v_rewards int;
  v_last timestamptz;
  v_sid uuid;
  v_key text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT public.fn_rewarded_enabled() THEN
    RAISE EXCEPTION 'DISABLED';
  END IF;
  SELECT * INTO v_pol FROM public.rewarded_ad_policy WHERE id = 0;
  IF NOT FOUND OR NOT v_pol.enabled THEN
    RAISE EXCEPTION 'DISABLED';
  END IF;
  SELECT * INTO v_def FROM public.rewarded_ad_reward_definitions
  WHERE slug = p_reward_slug;
  IF NOT FOUND OR NOT v_def.enabled THEN
    RAISE EXCEPTION 'INVALID_REWARD';
  END IF;
  IF v_def.kind = 'coins' AND NOT v_pol.allow_coin_rewards THEN
    RAISE EXCEPTION 'INVALID_REWARD';
  END IF;
  SELECT count(*)::int INTO v_today FROM public.rewarded_ad_sessions
  WHERE user_id = v_me AND created_at >= date_trunc('day', now());
  SELECT count(*)::int INTO v_rewards FROM public.rewarded_ad_sessions
  WHERE user_id = v_me AND status = 'rewarded'
    AND rewarded_at >= date_trunc('day', now());
  SELECT max(created_at) INTO v_last FROM public.rewarded_ad_sessions
  WHERE user_id = v_me;
  IF v_today >= v_pol.daily_limit THEN
    RAISE EXCEPTION 'DAILY_LIMIT';
  END IF;
  IF v_rewards >= v_pol.max_rewards_per_day THEN
    RAISE EXCEPTION 'REWARD_CAP';
  END IF;
  IF v_last IS NOT NULL
     AND v_last > now() - (v_pol.cooldown_minutes || ' minutes')::interval THEN
    RAISE EXCEPTION 'COOLDOWN';
  END IF;
  -- Offer keys must differ per call even inside one transaction
  -- (now() is txn-frozen): wall clock plus randomness.
  v_key := 'rewarded-ad:offer:' || v_me::text || ':'
    || clock_timestamp()::text || ':' || random()::text
    || ':' || COALESCE(p_placement, 'general') || ':' || p_reward_slug;
  INSERT INTO public.rewarded_ad_sessions
    (user_id, provider, reward_slug, placement, status, idempotency_key)
  VALUES (v_me, v_pol.provider, p_reward_slug,
    COALESCE(NULLIF(p_placement, ''), 'general'), 'offered', md5(v_key))
  RETURNING id INTO v_sid;
  PERFORM public.fn_track_rewarded(v_sid, v_me, 'opportunity_shown');
  PERFORM public.fn_log_rewarded(v_sid, v_me, 'offered',
    jsonb_build_object('placement', p_placement, 'reward', p_reward_slug));
  RETURN v_sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_rewarded_opt_in(p_session uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_s record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_s FROM public.rewarded_ad_sessions WHERE id = p_session;
  IF NOT FOUND OR v_s.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_s.expires_at <= now() THEN
    UPDATE public.rewarded_ad_sessions SET status = 'expired',
      updated_at = now() WHERE id = p_session;
    PERFORM public.fn_track_rewarded(p_session, v_me, 'no_fill');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'expired', '{}'::jsonb);
    RETURN 'expired';
  END IF;
  IF v_s.status <> 'offered' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  UPDATE public.rewarded_ad_sessions
  SET status = 'opted_in', opted_in_at = now(), updated_at = now()
  WHERE id = p_session;
  PERFORM public.fn_track_rewarded(p_session, v_me, 'user_opted_in');
  PERFORM public.fn_log_rewarded(p_session, v_me, 'opted_in', '{}'::jsonb);
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_rewarded_cancel(p_session uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_s record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_s FROM public.rewarded_ad_sessions WHERE id = p_session;
  IF NOT FOUND OR v_s.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT public.fn_rewarded_can_transition(v_s.status, 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  UPDATE public.rewarded_ad_sessions
  SET status = 'cancelled', updated_at = now() WHERE id = p_session;
  PERFORM public.fn_track_rewarded(p_session, v_me, 'user_declined');
  PERFORM public.fn_log_rewarded(p_session, v_me, 'cancelled', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_rewarded_start(p_session uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_s record;
  v_ref text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_s FROM public.rewarded_ad_sessions WHERE id = p_session;
  IF NOT FOUND OR v_s.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_s.expires_at <= now() THEN
    UPDATE public.rewarded_ad_sessions SET status = 'expired',
      updated_at = now() WHERE id = p_session;
    PERFORM public.fn_track_rewarded(p_session, v_me, 'no_fill');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'expired', '{}'::jsonb);
    RETURN 'expired';
  END IF;
  IF v_s.status <> 'opted_in' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  v_ref := v_s.provider || ':' || p_session::text;
  UPDATE public.rewarded_ad_sessions
  SET status = 'started', provider_reference = v_ref,
      started_at = now(), updated_at = now()
  WHERE id = p_session;
  PERFORM public.fn_track_rewarded(p_session, v_me, 'ad_started');
  PERFORM public.fn_log_rewarded(p_session, v_me, 'started',
    jsonb_build_object('provider_reference', v_ref));
  RETURN v_ref;
END;
$$;

-- ---------------------------------------------------------------------------
-- Completion: the browser is NEVER trusted. Mock events must carry the
-- exact issued provider_reference within the session window (dev-only
-- simulation of a provider confirmation). Google Offerwall exposes no
-- verifiable per-completion callback, so it always fails closed here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rewarded_complete(
  p_session uuid, p_event jsonb
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_s record;
  v_pol public.rewarded_ad_policy;
  v_ref text;
  v_at timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_s FROM public.rewarded_ad_sessions WHERE id = p_session;
  IF NOT FOUND OR v_s.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_s.status <> 'started' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF v_s.expires_at <= now() THEN
    UPDATE public.rewarded_ad_sessions SET status = 'expired',
      updated_at = now() WHERE id = p_session;
    PERFORM public.fn_track_rewarded(p_session, v_me, 'no_fill');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'expired', '{}'::jsonb);
    RETURN 'expired';
  END IF;
  IF v_s.provider = 'google_offerwall' THEN
    -- No documented server-verifiable completion hook exists for
    -- Offerwall custom rewards: fail closed, do not invent one.
    PERFORM public.fn_track_rewarded(p_session, v_me, 'provider_error');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'unverifiable',
      jsonb_build_object('provider', 'google_offerwall'));
    UPDATE public.rewarded_ad_sessions SET status = 'failed',
      updated_at = now() WHERE id = p_session;
    RETURN 'unverifiable';
  END IF;
  SELECT * INTO v_pol FROM public.rewarded_ad_policy WHERE id = 0;
  IF v_s.provider <> 'mock' OR NOT COALESCE(v_pol.mock_allowed, false) THEN
    RAISE EXCEPTION 'DISABLED';
  END IF;
  v_ref := p_event ->> 'provider_reference';
  v_at := COALESCE((p_event ->> 'completed_at')::timestamptz, now());
  IF v_ref IS NULL OR v_ref <> v_s.provider_reference
     OR v_at IS NULL OR v_at < v_s.started_at
     OR v_at > now() + interval '1 minute' THEN
    PERFORM public.fn_track_rewarded(p_session, v_me, 'verification_failure');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'forged_event',
      COALESCE(p_event, '{}'::jsonb));
    RETURN 'forged';
  END IF;
  UPDATE public.rewarded_ad_sessions
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_session;
  PERFORM public.fn_track_rewarded(p_session, v_me, 'ad_completed');
  PERFORM public.fn_log_rewarded(p_session, v_me, 'completed', '{}'::jsonb);
  RETURN 'completed';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_rewarded_verify(p_session uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_s record;
  v_pol public.rewarded_ad_policy;
  v_def record;
  v_rewards int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_s FROM public.rewarded_ad_sessions WHERE id = p_session;
  IF NOT FOUND OR v_s.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_s.status <> 'completed' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF NOT public.fn_rewarded_enabled() THEN
    RAISE EXCEPTION 'DISABLED';
  END IF;
  SELECT * INTO v_pol FROM public.rewarded_ad_policy WHERE id = 0;
  SELECT * INTO v_def FROM public.rewarded_ad_reward_definitions
  WHERE slug = v_s.reward_slug;
  IF NOT FOUND OR NOT v_def.enabled
     OR (v_def.kind = 'coins' AND NOT v_pol.allow_coin_rewards) THEN
    UPDATE public.rewarded_ad_sessions SET status = 'failed',
      updated_at = now() WHERE id = p_session;
    PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
      jsonb_build_object('at', 'verify'));
    RETURN 'denied:INVALID_REWARD';
  END IF;
  SELECT count(*)::int INTO v_rewards FROM public.rewarded_ad_sessions
  WHERE user_id = v_me AND status = 'rewarded'
    AND rewarded_at >= date_trunc('day', now());
  IF v_rewards >= v_pol.max_rewards_per_day THEN
    UPDATE public.rewarded_ad_sessions SET status = 'failed',
      updated_at = now() WHERE id = p_session;
    PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
      jsonb_build_object('at', 'verify'));
    RETURN 'denied:REWARD_CAP';
  END IF;
  UPDATE public.rewarded_ad_sessions
  SET status = 'verified', verified_at = now(), updated_at = now()
  WHERE id = p_session;
  PERFORM public.fn_track_rewarded(p_session, v_me, 'verification_success');
  PERFORM public.fn_log_rewarded(p_session, v_me, 'verified', '{}'::jsonb);
  RETURN 'verified';
END;
$$;

-- ---------------------------------------------------------------------------
-- Grant: exactly once per session (row lock + UNIQUE grant rows).
-- Items reuse the M16 inventory rails; coins reuse the M5 ledger and
-- only when explicitly allowed; recovery restores streak state per
-- policy WITHOUT writing manufactured activity rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rewarded_grant(p_session uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_s record;
  v_pol public.rewarded_ad_policy;
  v_def record;
  v_key text;
  v_gid uuid;
  v_item record;
  v_have int;
  v_balance int;
  v_new int;
  v_streak record;
  v_lapsed int;
  v_dates date[];
  v_d date;
  v_uses int;
  v_last timestamptz;
  v_n int := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_s FROM public.rewarded_ad_sessions
  WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR v_s.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_s.status = 'rewarded' THEN
    PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_duplicate');
    SELECT id INTO v_gid FROM public.rewarded_ad_grants
    WHERE session_id = p_session;
    RETURN v_gid::text;
  END IF;
  IF v_s.status <> 'verified' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT * INTO v_pol FROM public.rewarded_ad_policy WHERE id = 0;
  SELECT * INTO v_def FROM public.rewarded_ad_reward_definitions
  WHERE slug = v_s.reward_slug;
  IF NOT FOUND OR NOT v_def.enabled THEN
    UPDATE public.rewarded_ad_sessions SET status = 'failed',
      updated_at = now() WHERE id = p_session;
    PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
    PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
      jsonb_build_object('at', 'grant'));
    RETURN 'denied:INVALID_REWARD';
  END IF;
  v_key := 'rewarded-ad:' || v_s.provider || ':'
    || COALESCE(v_s.provider_reference, p_session::text)
    || ':' || v_me::text || ':v1';

  IF v_def.kind = 'item' THEN
    SELECT * INTO v_item FROM public.shop_items WHERE slug = v_def.ref;
    IF NOT FOUND OR NOT v_item.is_active THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:INVALID_REWARD';
    END IF;
    SELECT COALESCE(quantity, 0) INTO v_have FROM public.shop_inventory
    WHERE user_id = v_me AND item_id = v_item.id;
    IF NOT FOUND THEN
      v_have := 0;
    END IF;
    IF v_have + v_def.amount > v_item.max_own THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:LIMIT';
    END IF;
    INSERT INTO public.shop_inventory (user_id, item_id, quantity)
    VALUES (v_me, v_item.id, v_def.amount)
    ON CONFLICT (user_id, item_id) DO UPDATE SET
      quantity = shop_inventory.quantity + v_def.amount;
    INSERT INTO public.item_grants
      (purchase_id, user_id, clan_id, item_id, quantity, reason)
    VALUES (NULL, v_me, NULL, v_item.id, v_def.amount, 'rewarded_ad');
  ELSIF v_def.kind = 'coins' THEN
    IF NOT v_pol.allow_coin_rewards THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:INVALID_REWARD';
    END IF;
    SELECT coin_balance INTO v_balance FROM public.profiles
    WHERE id = v_me FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    v_new := v_balance + v_def.amount;
    INSERT INTO public.coin_ledger
      (user_id, amount, source, source_type, reference_id, reason,
       metadata, balance_after)
    VALUES (v_me, v_def.amount, 'rewarded_ad', 'rewarded_ad', v_key,
      'rewarded ad grant',
      jsonb_build_object('session_id', p_session), v_new);
    UPDATE public.profiles SET coin_balance = v_new WHERE id = v_me;
  ELSE
    -- Streak recovery: bounded by policy, forward-only state repair,
    -- zero manufactured activity rows.
    SELECT * INTO v_streak FROM public.streaks WHERE user_id = v_me;
    IF NOT FOUND OR v_streak.last_active_date IS NULL THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:NO_LAPSE';
    END IF;
    v_lapsed := (CURRENT_DATE - v_streak.last_active_date) - 1;
    IF v_lapsed < 1 OR v_lapsed > v_pol.recovery_window_days THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:NOT_RECOVERABLE';
    END IF;
    SELECT count(*)::int, max(created_at) INTO v_uses, v_last
    FROM public.streak_recoveries WHERE user_id = v_me;
    IF v_uses >= v_pol.recovery_max_uses THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:RECOVERY_CAP';
    END IF;
    IF v_last IS NOT NULL
       AND v_last > now() - (v_pol.recovery_cooldown_hours || ' hours')::interval THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:RECOVERY_COOLDOWN';
    END IF;
    SELECT array_agg(d) INTO v_dates
    FROM (
      SELECT (CURRENT_DATE - gs.i)::date AS d
      FROM generate_series(1, LEAST(v_lapsed, v_pol.recovery_max_days)) AS gs(i)
      ORDER BY 1 DESC
      LIMIT v_pol.recovery_ads_per_day
    ) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.streak_recoveries r
                      WHERE r.user_id = v_me AND r.recovered_date = t.d);
    IF v_dates IS NULL OR array_length(v_dates, 1) IS NULL THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:ALREADY_RECOVERED';
    END IF;
    -- Forward-only: never move an active streak backward.
    UPDATE public.streaks SET last_active_date = CURRENT_DATE - 1,
      updated_at = now()
    WHERE user_id = v_me AND last_active_date < CURRENT_DATE - 1;
    FOREACH v_d IN ARRAY v_dates LOOP
      INSERT INTO public.streak_recoveries
        (user_id, recovered_date, session_id)
      VALUES (v_me, v_d, p_session)
      ON CONFLICT (user_id, recovered_date) DO NOTHING;
      v_n := v_n + 1;
    END LOOP;
    IF v_n = 0 THEN
      UPDATE public.rewarded_ad_sessions SET status = 'failed',
        updated_at = now() WHERE id = p_session;
      PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_denied');
      PERFORM public.fn_log_rewarded(p_session, v_me, 'denied',
        jsonb_build_object('at', 'grant'));
      RETURN 'denied:ALREADY_RECOVERED';
    END IF;
  END IF;

  INSERT INTO public.rewarded_ad_grants
    (session_id, user_id, kind, ref, amount, grant_key)
  VALUES (p_session, v_me, v_def.kind, v_def.ref, v_def.amount, v_key)
  ON CONFLICT (session_id) DO NOTHING
  RETURNING id INTO v_gid;
  IF NOT FOUND THEN
    PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_duplicate');
    SELECT id INTO v_gid FROM public.rewarded_ad_grants
    WHERE session_id = p_session;
    RETURN v_gid::text;
  END IF;
  UPDATE public.rewarded_ad_sessions
  SET status = 'rewarded', rewarded_at = now(), updated_at = now()
  WHERE id = p_session;
  PERFORM public.fn_track_rewarded(p_session, v_me, 'reward_granted');
  PERFORM public.fn_log_rewarded(p_session, v_me, 'rewarded',
    jsonb_build_object('kind', v_def.kind, 'ref', v_def.ref));
  RETURN v_gid::text;
END;
$$;

-- Expire stale non-terminal sessions (scheduler + recovery path).
CREATE OR REPLACE FUNCTION public.fn_rewarded_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN SELECT id, user_id FROM public.rewarded_ad_sessions
           WHERE status IN ('offered', 'opted_in', 'started')
             AND expires_at <= now()
  LOOP
    UPDATE public.rewarded_ad_sessions SET status = 'expired',
      updated_at = now() WHERE id = r.id;
    PERFORM public.fn_track_rewarded(r.id, r.user_id, 'no_fill');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin: policy, reward toggles, feature flags (teachers read-only by
-- construction — no teacher path exists here).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_rewarded_policy(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.rewarded_ad_policy SET
    enabled = COALESCE((p_patch ->> 'enabled')::boolean, enabled),
    provider = COALESCE(
      CASE WHEN p_patch ->> 'provider' IN ('google_offerwall', 'mock')
           THEN (p_patch ->> 'provider') ELSE NULL END, provider),
    mock_allowed = COALESCE((p_patch ->> 'mock_allowed')::boolean, mock_allowed),
    daily_limit = COALESCE((p_patch ->> 'daily_limit')::int, daily_limit),
    cooldown_minutes = COALESCE((p_patch ->> 'cooldown_minutes')::int, cooldown_minutes),
    max_rewards_per_day = COALESCE(
      (p_patch ->> 'max_rewards_per_day')::int, max_rewards_per_day),
    allow_coin_rewards = COALESCE(
      (p_patch ->> 'allow_coin_rewards')::boolean, allow_coin_rewards),
    recovery_max_days = COALESCE(
      (p_patch ->> 'recovery_max_days')::int, recovery_max_days),
    recovery_ads_per_day = COALESCE(
      (p_patch ->> 'recovery_ads_per_day')::int, recovery_ads_per_day),
    recovery_window_days = COALESCE(
      (p_patch ->> 'recovery_window_days')::int, recovery_window_days),
    recovery_cooldown_hours = COALESCE(
      (p_patch ->> 'recovery_cooldown_hours')::int, recovery_cooldown_hours),
    recovery_max_uses = COALESCE(
      (p_patch ->> 'recovery_max_uses')::int, recovery_max_uses),
    updated_at = now()
  WHERE id = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_reward_definition(
  p_slug text, p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.rewarded_ad_reward_definitions SET enabled = p_enabled
  WHERE slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_rewarded_flag(
  p_key text, p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_key NOT IN ('REWARDED_ADS_ENABLED', 'GOOGLE_REWARDED_ENABLED') THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  UPDATE public.feature_flags SET enabled = p_enabled, updated_at = now()
  WHERE key = p_key;
END;
$$;

-- Funnel analytics (counts only; revenue stays in Google reporting).
CREATE OR REPLACE FUNCTION public.fn_rewarded_funnel()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN jsonb_build_object(
    'events', (SELECT COALESCE(jsonb_object_agg(event, n), '{}'::jsonb)
      FROM (SELECT event, count(*) AS n FROM public.rewarded_ad_events
            WHERE created_at > now() - interval '30 days'
            GROUP BY event) AS e),
    'sessions', (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
      FROM (SELECT status, count(*) AS n FROM public.rewarded_ad_sessions
            GROUP BY status) AS s),
    'grants', (SELECT count(*) FROM public.rewarded_ad_grants));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_rewarded_can_transition(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_can_transition(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_log_rewarded(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_log_rewarded(uuid, uuid, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_track_rewarded(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_track_rewarded(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_policy() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_enabled() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_offer(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_offer(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_opt_in(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_opt_in(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_cancel(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_start(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_start(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_complete(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_complete(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_verify(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_verify(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_grant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_grant(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_sweep() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_rewarded_policy(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_rewarded_policy(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_reward_definition(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_reward_definition(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_rewarded_flag(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_rewarded_flag(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rewarded_funnel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rewarded_funnel() TO authenticated;
