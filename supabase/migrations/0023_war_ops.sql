-- M11 war operations: challenge/accept lifecycle, eligibility snapshots,
-- submissions, deterministic scoring, idempotent M5 rewards, scheduler
-- sweep. Students never write war state directly (no policies for writes).

CREATE OR REPLACE FUNCTION public.fn_war_actor_clan()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clan_id FROM public.clan_members
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$;

-- Scope compatibility between two clans (configurable, never hard-coded
-- to a single policy; cross-org needs an explicit super-admin challenger).
CREATE OR REPLACE FUNCTION public.fn_war_scope_ok(
  p_a uuid, p_b uuid, p_scope text, p_challenger_is_super boolean
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca uuid;
  v_cb uuid;
  v_oa uuid;
  v_ob uuid;
BEGIN
  SELECT course_id INTO v_ca FROM public.batches b
  JOIN public.clans c ON c.batch_id = b.id WHERE c.id = p_a;
  SELECT course_id INTO v_cb FROM public.batches b
  JOIN public.clans c ON c.batch_id = b.id WHERE c.id = p_b;
  IF p_scope = 'same_course' THEN
    RETURN v_ca = v_cb;
  END IF;
  v_oa := public.batch_organization_id(
    (SELECT batch_id FROM public.clans WHERE id = p_a));
  v_ob := public.batch_organization_id(
    (SELECT batch_id FROM public.clans WHERE id = p_b));
  IF p_scope = 'cross_course' OR p_scope = 'same_org' THEN
    RETURN v_oa = v_ob;
  END IF;
  IF p_scope = 'cross_org' THEN
    RETURN p_challenger_is_super;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_log_war(
  p_war uuid, p_from public.clan_war_status,
  p_to public.clan_war_status, p_actor uuid
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.clan_war_state_events
    (war_id, from_status, to_status, actor_user_id)
  VALUES (p_war, p_from, p_to, p_actor);
$$;

-- Challenge: challenger leadership only; scope + single-active-war guards.
-- Challenge discovery: clan leaders/co-leaders may list active same-org
-- clans (identity only) to pick opponents. Private clan data stays gated
-- by fn_is_clan_viewer; this returns names, never rosters or activity.
CREATE OR REPLACE FUNCTION public.fn_challengeable_clans()
RETURNS TABLE (clan_id uuid, clan_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_mine uuid;
  v_org uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  SELECT m.clan_id INTO v_mine FROM public.clan_members m
  WHERE m.user_id = v_me AND m.status = 'active'
    AND m.role IN ('leader', 'co_leader') LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT organization_id INTO v_org FROM public.clans WHERE id = v_mine;
  RETURN QUERY
  SELECT c.id, c.name FROM public.clans c
  WHERE c.status = 'active' AND c.organization_id = v_org AND c.id <> v_mine
  ORDER BY c.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_challengeable_clans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_challengeable_clans() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_challenge_clan(
  p_defender uuid, p_config jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_ch uuid;
  v_scope text;
  v_war uuid;
  v_slug text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT public.fn_war_actor_clan() INTO v_ch;
  IF v_ch IS NULL OR NOT public.fn_is_clan_staff(v_ch, v_me) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_ch = p_defender THEN
    RAISE EXCEPTION 'SELF_CHALLENGE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clans
                 WHERE id = v_ch AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.clans
                    WHERE id = p_defender AND status = 'active') THEN
    RAISE EXCEPTION 'CLAN_INACTIVE';
  END IF;
  v_scope := COALESCE(p_config ->> 'scope', 'same_course');
  IF NOT public.fn_war_scope_ok(
      v_ch, p_defender, v_scope, public.is_super_admin()) THEN
    RAISE EXCEPTION 'SCOPE_FORBIDDEN';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_wars
             WHERE status NOT IN ('finalized', 'cancelled', 'declined', 'expired', 'draft')
               AND (challenger_clan_id IN (v_ch, p_defender)
                 OR defender_clan_id IN (v_ch, p_defender))) THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE';
  END IF;
  INSERT INTO public.clan_wars (
    challenger_clan_id, defender_clan_id, created_by,
    preparation_start, battle_start, battle_end,
    scoring_profile, attempt_policy, eligibility, reward_policy, rules)
  VALUES (
    v_ch, p_defender, v_me, NULL, NULL, NULL,
    COALESCE(p_config -> 'scoring',
      '{"mode": "sum", "player_policy": "best_score"}'::jsonb),
    COALESCE(p_config ->> 'attempt_policy', 'BEST_SCORE'),
    jsonb_build_object('scope', v_scope,
      'min_level', COALESCE((p_config ->> 'min_level')::int, 1)),
    COALESCE(p_config -> 'rewards',
      '{"winner_xp": 100, "winner_coins": 10, "participant_xp": 20, "participant_coins": 2}'::jsonb),
    jsonb_build_object(
      'attempts_per_player', COALESCE((p_config ->> 'attempts_per_player')::int, 5),
      'prep_hours', COALESCE((p_config ->> 'prep_hours')::int, 2),
      'battle_hours', COALESCE((p_config ->> 'battle_hours')::int, 2),
      'tie_breakers', COALESCE(p_config -> 'tie_breakers',
        '["total", "accuracy", "best", "participation", "earliest"]'::jsonb)))
  RETURNING id INTO v_war;
  FOR v_slug IN SELECT * FROM jsonb_array_elements_text(
      COALESCE(p_config -> 'game_slugs', '[]'::jsonb)) LOOP
    INSERT INTO public.clan_war_games (war_id, game_id)
    SELECT v_war, g.id FROM public.games g
    WHERE g.slug = v_slug AND g.is_active
    ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO public.clan_war_invitations
    (war_id, from_clan_id, to_clan_id)
  VALUES (v_war, v_ch, p_defender);
  UPDATE public.clan_wars SET status = 'challenge_sent', updated_at = now()
  WHERE id = v_war;
  PERFORM public.fn_log_war(v_war, 'draft', 'challenge_sent', v_me);
  RETURN v_war;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_war_dispatch(p_war uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_war.status <> 'challenge_sent' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF NOT public.fn_is_clan_staff(v_war.challenger_clan_id, auth.uid())
    AND NOT public.fn_can_manage_clan(v_war.challenger_clan_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.clan_wars
  SET status = 'pending_response', updated_at = now() WHERE id = p_war;
  PERFORM public.fn_log_war(p_war, 'challenge_sent', 'pending_response', auth.uid());
END;
$$;

-- Respond: defender leadership only (never the challenger, never members).
CREATE OR REPLACE FUNCTION public.fn_respond_war(p_war uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_me uuid := auth.uid();
  v_prep int;
  v_battle int;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_war.status <> 'pending_response' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF NOT public.fn_is_clan_staff(v_war.defender_clan_id, v_me) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.clan_war_invitations
  SET status = (CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
    )::public.clan_war_invite_status,
      decided_by = v_me, decided_at = now()
  WHERE war_id = p_war AND status = 'pending';
  IF p_accept THEN
    v_prep := COALESCE((v_war.rules ->> 'prep_hours')::int, 2);
    v_battle := COALESCE((v_war.rules ->> 'battle_hours')::int, 2);
    UPDATE public.clan_wars
    SET status = 'accepted',
        preparation_start = now(),
        battle_start = now() + (v_prep || ' hours')::interval,
        battle_end = now() + ((v_prep + v_battle) || ' hours')::interval,
        updated_at = now()
    WHERE id = p_war;
    PERFORM public.fn_log_war(p_war, 'pending_response', 'accepted', v_me);
  ELSE
    UPDATE public.clan_wars
    SET status = 'declined', updated_at = now() WHERE id = p_war;
    PERFORM public.fn_log_war(p_war, 'pending_response', 'declined', v_me);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cancel_war(p_war uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_me uuid := auth.uid();
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT public.fn_war_can_transition(v_war.status, 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF NOT public.fn_is_clan_staff(v_war.challenger_clan_id, v_me)
    AND NOT public.fn_can_manage_clan(v_war.challenger_clan_id)
    AND NOT public.fn_can_manage_clan(v_war.defender_clan_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.clan_wars
  SET status = 'cancelled', updated_at = now() WHERE id = p_war;
  UPDATE public.clan_war_invitations SET status = 'expired'
  WHERE war_id = p_war AND status = 'pending';
  PERFORM public.fn_log_war(p_war, v_war.status, 'cancelled', v_me);
END;
$$;

-- Scheduler sweep: expire stale invites, advance due windows.
-- Contract for production schedulers (cron/Workers): call this often;
-- manual/admin triggers call fn_advance_war for one war.
CREATE OR REPLACE FUNCTION public.fn_expire_wars()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
  r record;
BEGIN
  FOR r IN SELECT id, status FROM public.clan_wars
           WHERE status IN ('challenge_sent', 'pending_response')
             AND created_at < now() - interval '72 hours'
  LOOP
    UPDATE public.clan_wars
    SET status = 'expired', updated_at = now() WHERE id = r.id;
    UPDATE public.clan_war_invitations SET status = 'expired'
    WHERE war_id = r.id AND status = 'pending';
    PERFORM public.fn_log_war(r.id, r.status, 'expired', NULL);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Advance one war through time-gated hops + freeze eligibility at live.
CREATE OR REPLACE FUNCTION public.fn_advance_war(p_war uuid)
RETURNS public.clan_war_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_min int;
  v_to public.clan_war_status;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  v_to := v_war.status;
  IF v_war.status = 'accepted'
     AND v_war.preparation_start IS NOT NULL
     AND v_war.preparation_start <= now() THEN
    v_to := 'preparation';
  ELSIF v_war.status = 'preparation'
     AND v_war.battle_start IS NOT NULL
     AND v_war.battle_start <= now() THEN
    v_to := 'live';
  ELSIF v_war.status = 'live'
     AND v_war.battle_end IS NOT NULL
     AND v_war.battle_end <= now() THEN
    v_to := 'processing';
  ELSE
    RETURN v_war.status;
  END IF;
  IF NOT public.fn_war_can_transition(v_war.status, v_to) THEN
    RETURN v_war.status;
  END IF;
  UPDATE public.clan_wars
  SET status = v_to, updated_at = now() WHERE id = p_war;
  PERFORM public.fn_log_war(p_war, v_war.status, v_to, auth.uid());
  -- Freeze the participant set exactly when battle goes live.
  IF v_to = 'live' THEN
    v_min := COALESCE((v_war.eligibility ->> 'min_level')::int, 1);
    INSERT INTO public.clan_war_participants
      (war_id, user_id, clan_id, eligible, eligibility_snapshot)
    SELECT p_war, m.user_id, m.clan_id, true,
           jsonb_build_object('level', COALESCE(p.current_level, 1),
                              'clan_id', m.clan_id)
    FROM public.clan_members m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.status = 'active'
      AND m.clan_id IN (v_war.challenger_clan_id, v_war.defender_clan_id)
      AND COALESCE(p.current_level, 1) >= v_min
    ON CONFLICT (war_id, user_id) DO NOTHING;
  END IF;
  RETURN v_to;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_war_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_n int := 0;
BEGIN
  PERFORM public.fn_expire_wars();
  FOR v_id IN SELECT id FROM public.clan_wars
              WHERE status IN ('accepted', 'preparation', 'live')
  LOOP
    PERFORM public.fn_advance_war(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_challenge_clan(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_challenge_clan(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_war_dispatch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_war_dispatch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_respond_war(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_respond_war(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cancel_war(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancel_war(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_advance_war(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_war(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_war_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_war_sweep() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_expire_wars() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_expire_wars() TO authenticated;
