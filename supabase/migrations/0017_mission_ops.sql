-- M9 mission operations: admin CRUD, deterministic assignment, start,
-- server-derived sync + idempotent M5 rewards. Students can never write
-- missions or progress directly (no INSERT/UPDATE policies for them).

-- ---------------------------------------------------------------------------
-- Admin: create / draft-update (versioned) / activate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_mission(p_def jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_def ->> 'slug' IS NULL OR p_def ->> 'title' IS NULL THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.missions (
    slug, title, description, category, world_id, difficulty, skill_band,
    objective_type, target, game_constraints, duration_days, starts_at,
    ends_at, prerequisites, reward_profile, visibility)
  VALUES (
    p_def ->> 'slug', p_def ->> 'title', COALESCE(p_def ->> 'description', ''),
    COALESCE(p_def ->> 'category', 'DAILY'), p_def ->> 'world_id',
    COALESCE(p_def ->> 'difficulty', 'beginner'), p_def ->> 'skill_band',
    COALESCE(p_def ->> 'objective_type', 'GAMES_COMPLETED'),
    COALESCE(p_def -> 'target', '{}'::jsonb),
    COALESCE(p_def -> 'game_constraints', '{}'::jsonb),
    (p_def ->> 'duration_days')::int,
    (p_def ->> 'starts_at')::timestamptz, (p_def ->> 'ends_at')::timestamptz,
    COALESCE(p_def -> 'prerequisites', '{}'::jsonb),
    COALESCE(p_def -> 'reward_profile', '{"xp": 20, "coins": 2}'::jsonb),
    COALESCE(p_def ->> 'visibility', 'batch'))
  RETURNING id INTO v_id;
  INSERT INTO public.mission_versions (mission_id, version, definition)
  SELECT v_id, version,
    to_jsonb(m.*) - 'created_at' - 'updated_at'
  FROM public.missions m WHERE m.id = v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_SLUG';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_mission_draft(
  p_mission uuid, p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.mission_status;
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT status INTO v_status FROM public.missions WHERE id = p_mission;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  UPDATE public.missions SET
    title = COALESCE(p_patch ->> 'title', title),
    description = COALESCE(p_patch ->> 'description', description),
    category = COALESCE(p_patch ->> 'category', category),
    difficulty = COALESCE(p_patch ->> 'difficulty', difficulty),
    skill_band = COALESCE(p_patch ->> 'skill_band', skill_band),
    target = COALESCE(p_patch -> 'target', target),
    game_constraints = COALESCE(p_patch -> 'game_constraints', game_constraints),
    prerequisites = COALESCE(p_patch -> 'prerequisites', prerequisites),
    reward_profile = COALESCE(p_patch -> 'reward_profile', reward_profile),
    starts_at = COALESCE((p_patch ->> 'starts_at')::timestamptz, starts_at),
    ends_at = COALESCE((p_patch ->> 'ends_at')::timestamptz, ends_at),
    version = version + 1,
    updated_at = now()
  WHERE id = p_mission;
  INSERT INTO public.mission_versions (mission_id, version, definition)
  SELECT p_mission, version,
    to_jsonb(m.*) - 'created_at' - 'updated_at'
  FROM public.missions m WHERE m.id = p_mission;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_mission_status(
  p_mission uuid, p_status public.mission_status
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.missions SET status = p_status, updated_at = now()
  WHERE id = p_mission;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Deterministic daily/weekly assignment (idempotent; same set all day).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_assign_daily_missions(p_user uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := public.fn_mission_tz(p_user);
  v_day date := (now() AT TIME ZONE v_tz)::date;
  v_me uuid := auth.uid();
  v_m record;
  v_inst uuid;
  v_n int := 0;
BEGIN
  IF v_me IS NULL OR (v_me <> p_user
      AND NOT public.fn_is_mission_admin()
      AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  FOR v_m IN
    SELECT m.id
    FROM public.missions m
    WHERE m.status = 'active'
      AND (m.category = 'DAILY' OR m.category IN (
        'GAME_COMPLETION', 'ACCURACY_TARGET', 'WPM_TARGET', 'SCORE_TARGET',
        'WORD_COUNT', 'CHARACTER_COUNT', 'PERFECT_RUN', 'WORLD_PROGRESS',
        'MULTI_GAME'))
      AND (m.starts_at IS NULL OR m.starts_at <= now())
      AND (m.ends_at IS NULL OR m.ends_at > now())
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(m.game_constraints -> 'games', '[]'::jsonb)) AS g(slug)
        JOIN public.game_unlocks u
          ON u.user_id = p_user AND u.game_slug = g.slug AND NOT u.unlocked)
    ORDER BY md5(p_user::text || v_day::text || m.id::text)
    LIMIT 3
  LOOP
    INSERT INTO public.mission_instances
      (mission_id, user_id, period, period_start)
    VALUES (v_m.id, p_user, 'daily', v_day)
    ON CONFLICT (mission_id, user_id, period_start) DO NOTHING
    RETURNING id INTO v_inst;
    IF NOT FOUND THEN
      SELECT id INTO v_inst FROM public.mission_instances
      WHERE mission_id = v_m.id AND user_id = p_user AND period_start = v_day;
    END IF;
    INSERT INTO public.daily_mission_assignments
      (user_id, day, mission_id, instance_id)
    VALUES (p_user, v_day, v_m.id, v_inst)
    ON CONFLICT (user_id, day, mission_id) DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_assign_weekly(p_user uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := public.fn_mission_tz(p_user);
  v_week date := date_trunc('week', now() AT TIME ZONE v_tz)::date;
  v_me uuid := auth.uid();
  v_m record;
  v_inst uuid;
  v_n int := 0;
BEGIN
  IF v_me IS NULL OR (v_me <> p_user
      AND NOT public.fn_is_mission_admin()
      AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  FOR v_m IN
    SELECT m.id
    FROM public.missions m
    WHERE m.status = 'active' AND m.category = 'WEEKLY'
      AND (m.starts_at IS NULL OR m.starts_at <= now())
      AND (m.ends_at IS NULL OR m.ends_at > now())
    ORDER BY md5(p_user::text || v_week::text || m.id::text)
    LIMIT 2
  LOOP
    INSERT INTO public.mission_instances
      (mission_id, user_id, period, period_start)
    VALUES (v_m.id, p_user, 'weekly', v_week)
    ON CONFLICT (mission_id, user_id, period_start) DO NOTHING
    RETURNING id INTO v_inst;
    IF NOT FOUND THEN
      SELECT id INTO v_inst FROM public.mission_instances
      WHERE mission_id = v_m.id AND user_id = p_user AND period_start = v_week;
    END IF;
    INSERT INTO public.weekly_challenges
      (user_id, week_start, mission_id, instance_id)
    VALUES (p_user, v_week, v_m.id, v_inst)
    ON CONFLICT (user_id, week_start, mission_id) DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_add_mission_objective(
  p_mission uuid, p_kind text, p_target jsonb, p_position int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pos int;
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missions
                 WHERE id = p_mission AND status = 'draft') THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  IF p_position IS NULL THEN
    SELECT COALESCE(max(position) + 1, 0) INTO v_pos
    FROM public.mission_objectives WHERE mission_id = p_mission;
  ELSE
    v_pos := p_position;
  END IF;
  INSERT INTO public.mission_objectives (mission_id, position, kind, target)
  VALUES (p_mission, v_pos, p_kind, COALESCE(p_target, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_add_mission_objective(uuid, text, jsonb, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_add_mission_objective(uuid, text, jsonb, int) TO authenticated;

-- Opt-in to an EVENT mission (self only; start() still gates prerequisites).
CREATE OR REPLACE FUNCTION public.fn_join_mission(p_mission uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_inst uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT id INTO v_inst FROM public.missions
  WHERE id = p_mission AND status = 'active' AND category = 'EVENT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO public.mission_instances
    (mission_id, user_id, period, period_start)
  VALUES (p_mission, v_me, 'event', (now() AT TIME ZONE public.fn_mission_tz(v_me))::date)
  ON CONFLICT (mission_id, user_id, period_start) DO NOTHING
  RETURNING id INTO v_inst;
  IF NOT FOUND THEN
    SELECT id INTO v_inst FROM public.mission_instances
    WHERE mission_id = p_mission AND user_id = v_me
      AND period_start = (now() AT TIME ZONE public.fn_mission_tz(v_me))::date;
  END IF;
  RETURN v_inst;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_join_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_join_mission(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_start_mission(p_instance uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_status public.mission_instance_status;
  v_elig jsonb;
  v_mid uuid;
BEGIN
  SELECT user_id, status, mission_id INTO v_user, v_status, v_mid
  FROM public.mission_instances WHERE id = p_instance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() <> v_user THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_status <> 'available' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  v_elig := public.fn_mission_eligibility(v_mid, v_user);
  IF NOT (v_elig ->> 'eligible')::boolean THEN
    RAISE EXCEPTION 'PREREQUISITE';
  END IF;
  UPDATE public.mission_instances
  SET status = 'active', started_at = now()
  WHERE id = p_instance;
END;
$$;
