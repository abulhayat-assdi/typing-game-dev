-- M9 mission sync: server-derived progress from validated attempts plus
-- idempotent M5 rewards. Rejected attempts contribute nothing; duplicate
-- events never double-pay (UNIQUE keys + ON CONFLICT guards).

-- Evaluate one objective kind. Returns (current, contributing attempt ids).
CREATE OR REPLACE FUNCTION public.fn_eval_objective(
  p_user uuid, p_kind text, p_target jsonb,
  p_from timestamptz, p_to timestamptz,
  p_games text[], p_worlds text[]
)
RETURNS TABLE (current numeric, attempt_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_need int := COALESCE((p_target ->> 'count')::int, 1);
  v_thr numeric := COALESCE((p_target ->> 'threshold')::numeric, 0);
  v_mode text := COALESCE(p_target ->> 'mode', 'max');
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT a.id, a.game_id, a.submitted_at,
           r.score, r.accuracy, r.effective_wpm,
           (r.raw ->> 'correctCharacters')::int AS chars,
           (r.raw ->> 'completedWords')::int AS words,
           (r.raw ->> 'incorrectCharacters')::int AS errors,
           g.world_id
    FROM public.game_attempts a
    JOIN public.attempt_results r ON r.attempt_id = a.id
    JOIN public.games g ON g.id = a.game_id
    WHERE a.user_id = p_user
      AND a.status = 'validated' AND r.is_valid
      AND a.submitted_at >= p_from AND a.submitted_at < p_to
      AND (p_games = '{}' OR g.slug = ANY (p_games))
      AND (p_worlds = '{}' OR g.world_id = ANY (p_worlds))
  )
  SELECT
    CASE p_kind
      WHEN 'GAMES_COMPLETED' THEN (SELECT count(*)::numeric FROM base)
      WHEN 'ACCURACY_REACHED' THEN COALESCE((SELECT max(accuracy) FROM base), 0)
      WHEN 'WPM_REACHED' THEN COALESCE((SELECT max(effective_wpm) FROM base), 0)
      WHEN 'SCORE_REACHED' THEN
        CASE WHEN v_mode = 'sum'
          THEN COALESCE((SELECT sum(score) FROM base), 0)
          ELSE COALESCE((SELECT max(score) FROM base), 0) END
      WHEN 'CHARS_TYPED' THEN COALESCE((SELECT sum(chars) FROM base), 0)
      WHEN 'WORDS_TYPED' THEN COALESCE((SELECT sum(words) FROM base), 0)
      WHEN 'PERFECT_RUN' THEN
        (SELECT count(*)::numeric FROM base WHERE errors = 0)
      WHEN 'DISTINCT_GAMES' THEN
        (SELECT count(DISTINCT game_id)::numeric FROM base)
      WHEN 'WORLD_GAMES' THEN (SELECT count(*)::numeric FROM base)
      WHEN 'PERSONAL_BEST' THEN (
        SELECT count(*)::numeric FROM public.personal_records pr
        WHERE pr.user_id = p_user
          AND pr.recorded_at >= p_from AND pr.recorded_at < p_to)
      ELSE 0
    END,
    CASE WHEN p_kind = 'PERSONAL_BEST' THEN '{}'::uuid[]
      ELSE COALESCE((SELECT array_agg(id) FROM base), '{}') END;
END;
$$;

-- Sync one instance: recompute objectives, log contributors, complete +
-- reward once. Returns the instance status after sync.
CREATE OR REPLACE FUNCTION public.fn_sync_mission_instance(p_instance uuid)
RETURNS public.mission_instance_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst record;
  v_m record;
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_games text[] := '{}';
  v_worlds text[] := '{}';
  v_obj record;
  v_n int := 0;
  v_done int := 0;
  v_prog jsonb := '{"objectives": []}'::jsonb;
  v_ev record;
  v_cur numeric;
  v_need numeric;
  v_aid uuid;
  v_ok boolean;
  v_xp int;
  v_coins int;
  v_key text;
  v_rewarded boolean := false;
BEGIN
  SELECT * INTO v_inst FROM public.mission_instances WHERE id = p_instance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_inst.status = 'completed' THEN
    RETURN v_inst.status;
  END IF;
  IF v_inst.status NOT IN ('available', 'active') THEN
    RETURN v_inst.status;
  END IF;
  SELECT * INTO v_m FROM public.missions WHERE id = v_inst.mission_id;
  v_tz := public.fn_mission_tz(v_inst.user_id);
  IF v_inst.period = 'daily' THEN
    v_from := (v_inst.period_start::text || ' 00:00')::timestamp AT TIME ZONE v_tz;
    v_to := v_from + interval '1 day';
  ELSIF v_inst.period = 'weekly' THEN
    v_from := (v_inst.period_start::text || ' 00:00')::timestamp AT TIME ZONE v_tz;
    v_to := v_from + interval '7 days';
  ELSE
    v_from := COALESCE(v_m.starts_at, now() - interval '30 days');
    v_to := COALESCE(v_m.ends_at, now() + interval '30 days');
  END IF;
  SELECT COALESCE(array_agg(x), '{}') INTO v_games
  FROM jsonb_array_elements_text(
    COALESCE(v_m.game_constraints -> 'games', '[]'::jsonb)) AS x;
  SELECT COALESCE(array_agg(x), '{}') INTO v_worlds
  FROM jsonb_array_elements_text(
    COALESCE(v_m.game_constraints -> 'worlds', '[]'::jsonb)) AS x;

  FOR v_obj IN
    SELECT position, kind, target FROM public.mission_objectives
    WHERE mission_id = v_inst.mission_id ORDER BY position
  LOOP
    v_n := v_n + 1;
    SELECT current, attempt_ids INTO v_ev
    FROM public.fn_eval_objective(
      v_inst.user_id, v_obj.kind, v_obj.target, v_from, v_to, v_games, v_worlds);
    v_cur := COALESCE(v_ev.current, 0);
    v_need := COALESCE(
      CASE WHEN v_obj.kind IN ('ACCURACY_REACHED', 'WPM_REACHED', 'SCORE_REACHED')
        THEN (v_obj.target ->> 'threshold')::numeric
        ELSE (v_obj.target ->> 'count')::numeric END, 1);
    v_ok := v_cur >= v_need;
    IF v_ok THEN
      v_done := v_done + 1;
    END IF;
    FOREACH v_aid IN ARRAY COALESCE(v_ev.attempt_ids, '{}') LOOP
      INSERT INTO public.mission_progress (instance_id, attempt_id)
      VALUES (p_instance, v_aid)
      ON CONFLICT (instance_id, attempt_id) DO NOTHING;
    END LOOP;
    v_prog := jsonb_set(v_prog, '{objectives}',
      COALESCE(v_prog -> 'objectives', '[]'::jsonb) || jsonb_build_object(
        'position', v_obj.position, 'kind', v_obj.kind,
        'current', v_cur, 'target', v_need, 'completed', v_ok));
  END LOOP;

  -- Missions without explicit objectives use the legacy single condition.
  IF v_n = 0 THEN
    v_n := 1;
    SELECT current, attempt_ids INTO v_ev
    FROM public.fn_eval_objective(
      v_inst.user_id, v_m.objective_type, v_m.target,
      v_from, v_to, v_games, v_worlds);
    v_cur := COALESCE(v_ev.current, 0);
    v_need := COALESCE(
      CASE WHEN v_m.objective_type IN ('ACCURACY_REACHED', 'WPM_REACHED', 'SCORE_REACHED')
        THEN (v_m.target ->> 'threshold')::numeric
        ELSE (v_m.target ->> 'count')::numeric END, 1);
    v_ok := v_cur >= v_need;
    IF v_ok THEN
      v_done := 1;
    END IF;
    FOREACH v_aid IN ARRAY COALESCE(v_ev.attempt_ids, '{}') LOOP
      INSERT INTO public.mission_progress (instance_id, attempt_id)
      VALUES (p_instance, v_aid)
      ON CONFLICT (instance_id, attempt_id) DO NOTHING;
    END LOOP;
    v_prog := jsonb_set(v_prog, '{objectives}',
      jsonb_build_array(jsonb_build_object(
        'position', 0, 'kind', v_m.objective_type,
        'current', v_cur, 'target', v_need, 'completed', v_ok)));
  END IF;

  UPDATE public.mission_instances
  SET progress = v_prog,
      status = CASE WHEN v_done = v_n AND v_n > 0 THEN 'completed'::public.mission_instance_status
                    ELSE status END,
      completed_at = CASE WHEN v_done = v_n AND v_n > 0 THEN now() ELSE completed_at END
  WHERE id = p_instance
    AND status <> 'completed'
  RETURNING status INTO v_inst.status;

  -- Reward once through the M5 ledgers (idempotent completion key).
  IF v_done = v_n AND v_n > 0 THEN
    v_key := 'mission:' || p_instance::text || ':completion:v1';
    v_xp := COALESCE((v_m.reward_profile ->> 'xp')::int, 0);
    v_coins := COALESCE((v_m.reward_profile ->> 'coins')::int, 0);
    INSERT INTO public.mission_completion_events (key, instance_id, user_id)
    VALUES (v_key, p_instance, v_inst.user_id)
    ON CONFLICT (key) DO NOTHING;
    INSERT INTO public.reward_events (key, user_id, attempt_id)
    VALUES (v_key, v_inst.user_id, NULL)
    ON CONFLICT (key) DO NOTHING;
    IF FOUND THEN
      IF v_xp > 0 THEN
        INSERT INTO public.xp_ledger
          (user_id, amount, source, source_type, reference_id, reason,
           metadata, balance_after)
        SELECT v_inst.user_id, v_xp, 'mission', 'mission', v_key,
               'mission completion',
               jsonb_build_object('instance_id', p_instance),
               COALESCE(xp_total, 0) + v_xp
        FROM public.profiles WHERE id = v_inst.user_id
        ON CONFLICT (user_id, source, reference_id) DO NOTHING;
        UPDATE public.profiles
        SET xp_total = xp_total + v_xp,
            current_level = (
              SELECT max(level) FROM public.levels
              WHERE required_xp <= xp_total + v_xp)
        WHERE id = v_inst.user_id
          AND EXISTS (SELECT 1 FROM public.xp_ledger
                      WHERE user_id = v_inst.user_id AND reference_id = v_key);
      END IF;
      IF v_coins > 0 THEN
        INSERT INTO public.coin_ledger
          (user_id, amount, source, source_type, reference_id, reason,
           metadata, balance_after)
        SELECT v_inst.user_id, v_coins, 'mission', 'mission', v_key,
               'mission completion',
               jsonb_build_object('instance_id', p_instance),
               COALESCE(coin_balance, 0) + v_coins
        FROM public.profiles WHERE id = v_inst.user_id
        ON CONFLICT (user_id, source, reference_id) DO NOTHING;
        UPDATE public.profiles SET coin_balance = coin_balance + v_coins
        WHERE id = v_inst.user_id
          AND EXISTS (SELECT 1 FROM public.coin_ledger
                      WHERE user_id = v_inst.user_id AND reference_id = v_key);
      END IF;
      INSERT INTO public.mission_reward_events (key, instance_id, user_id, xp, coins)
      VALUES (v_key, p_instance, v_inst.user_id, v_xp, v_coins)
      ON CONFLICT (key) DO NOTHING;
      UPDATE public.mission_instances SET reward_status = 'awarded'
      WHERE id = p_instance;
      v_rewarded := true;
    END IF;
  END IF;
  RETURN v_inst.status;
END;
$$;

-- Sync every active instance of a student. Self-service (or mission admin).
CREATE OR REPLACE FUNCTION public.fn_sync_missions(p_user uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
  v_n int := 0;
BEGIN
  IF v_me IS NULL OR (v_me <> p_user
      AND NOT public.fn_is_mission_admin()
      AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  FOR v_id IN
    SELECT id FROM public.mission_instances
    WHERE user_id = p_user AND status IN ('available', 'active')
  LOOP
    PERFORM public.fn_sync_mission_instance(v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Read projection: today's missions + weekly with progress for one student.
CREATE OR REPLACE FUNCTION public.fn_student_missions(p_user uuid)
RETURNS TABLE (
  instance_id uuid,
  mission_id uuid,
  slug text,
  title text,
  description text,
  category text,
  difficulty text,
  period public.mission_period,
  period_start date,
  status public.mission_instance_status,
  progress jsonb,
  reward_profile jsonb,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := public.fn_mission_tz(p_user);
  v_day date := (now() AT TIME ZONE v_tz)::date;
  v_week date := date_trunc('week', now() AT TIME ZONE v_tz)::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_can_view_mission_student(p_user) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT i.id, m.id, m.slug, m.title, m.description, m.category,
         m.difficulty, i.period, i.period_start, i.status, i.progress,
         m.reward_profile, i.started_at, i.completed_at
  FROM public.mission_instances i
  JOIN public.missions m ON m.id = i.mission_id
  WHERE i.user_id = p_user
    AND ((i.period = 'daily' AND i.period_start = v_day)
      OR (i.period = 'weekly' AND i.period_start = v_week)
      OR i.period = 'event')
  ORDER BY i.period, i.created_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: definitions readable (active public, drafts to admins); writes via
-- SECURITY DEFINER fns only. Student data: self + batch staff + admins.
-- ---------------------------------------------------------------------------
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_completion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_mission_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_reward_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY missions_select_active ON public.missions
  FOR SELECT TO authenticated USING (status = 'active');
CREATE POLICY missions_select_admin ON public.missions
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());

CREATE POLICY mission_versions_select ON public.mission_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.missions m
      WHERE m.id = mission_versions.mission_id
        AND (m.status = 'active'
          OR public.fn_is_mission_admin() OR public.is_super_admin())));

CREATE POLICY mission_objectives_select ON public.mission_objectives
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.missions m
      WHERE m.id = mission_objectives.mission_id
        AND (m.status = 'active'
          OR public.fn_is_mission_admin() OR public.is_super_admin())));

CREATE POLICY mission_instances_select ON public.mission_instances
  FOR SELECT TO authenticated
  USING (public.fn_can_view_mission_student(user_id));

CREATE POLICY mission_progress_select ON public.mission_progress
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.mission_instances i
      WHERE i.id = mission_progress.instance_id
        AND public.fn_can_view_mission_student(i.user_id)));

CREATE POLICY mission_completion_select ON public.mission_completion_events
  FOR SELECT TO authenticated
  USING (public.fn_can_view_mission_student(user_id));

CREATE POLICY mission_assignments_select ON public.daily_mission_assignments
  FOR SELECT TO authenticated
  USING (public.fn_can_view_mission_student(user_id));

CREATE POLICY mission_weekly_select ON public.weekly_challenges
  FOR SELECT TO authenticated
  USING (public.fn_can_view_mission_student(user_id));

CREATE POLICY mission_rewards_select ON public.mission_reward_events
  FOR SELECT TO authenticated
  USING (public.fn_can_view_mission_student(user_id));

REVOKE ALL ON FUNCTION public.fn_create_mission(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_mission(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_update_mission_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_mission_draft(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_mission_status(uuid, public.mission_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_mission_status(uuid, public.mission_status) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_assign_daily_missions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assign_daily_missions(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_assign_weekly(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assign_weekly(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_start_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_start_mission(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_missions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_missions(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_student_missions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_student_missions(uuid) TO authenticated;
