-- M13 season operations: admin CRUD, lifecycle, eligibility freeze,
-- pull-model source sync (existing finalized outcomes only — source
-- engines are never modified), deterministic boards, idempotent M5
-- rewards. Students never write season state (no policies for writes).

CREATE OR REPLACE FUNCTION public.fn_log_season(
  p_season uuid, p_from public.season_status,
  p_to public.season_status, p_actor uuid
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.season_state_events
    (season_id, from_status, to_status, actor_user_id)
  VALUES (p_season, p_from, p_to, p_actor);
$$;

CREATE OR REPLACE FUNCTION public.fn_create_season(p_def jsonb)
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
  IF p_def ->> 'slug' IS NULL OR p_def ->> 'name' IS NULL
     OR (p_def ->> 'start_at')::timestamptz IS NULL
     OR (p_def ->> 'end_at')::timestamptz IS NULL
     OR (p_def ->> 'end_at')::timestamptz
        <= (p_def ->> 'start_at')::timestamptz THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.seasons (
    slug, name, description, theme, banner_key, icon_key,
    start_at, end_at, registration_start,
    scoring_policy, reward_policy, eligibility, rules)
  VALUES (
    p_def ->> 'slug', p_def ->> 'name',
    COALESCE(p_def ->> 'description', ''), COALESCE(p_def ->> 'theme', ''),
    p_def ->> 'banner_key', p_def ->> 'icon_key',
    (p_def ->> 'start_at')::timestamptz, (p_def ->> 'end_at')::timestamptz,
    (p_def ->> 'registration_start')::timestamptz,
    COALESCE(p_def -> 'scoring_policy', '{}'::jsonb),
    COALESCE(p_def -> 'reward_policy', '{}'::jsonb),
    COALESCE(p_def -> 'eligibility', '{}'::jsonb),
    COALESCE(p_def -> 'rules', '{"overlap": "GLOBAL_SINGLE"}'::jsonb))
  RETURNING id INTO v_id;
  INSERT INTO public.season_versions (season_id, version, definition)
  SELECT v_id, version, to_jsonb(s.*) - 'created_at' - 'updated_at'
  FROM public.seasons s WHERE s.id = v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_SLUG';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_season_draft(
  p_season uuid, p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons
                 WHERE id = p_season AND status = 'draft') THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  UPDATE public.seasons SET
    name = COALESCE(NULLIF(p_patch ->> 'name', ''), name),
    description = COALESCE(p_patch ->> 'description', description),
    theme = COALESCE(p_patch ->> 'theme', theme),
    scoring_policy = COALESCE(p_patch -> 'scoring_policy', scoring_policy),
    reward_policy = COALESCE(p_patch -> 'reward_policy', reward_policy),
    eligibility = COALESCE(p_patch -> 'eligibility', eligibility),
    rules = COALESCE(p_patch -> 'rules', rules),
    start_at = COALESCE((p_patch ->> 'start_at')::timestamptz, start_at),
    end_at = COALESCE((p_patch ->> 'end_at')::timestamptz, end_at),
    version = version + 1,
    updated_at = now()
  WHERE id = p_season;
  INSERT INTO public.season_versions (season_id, version, definition)
  SELECT p_season, version, to_jsonb(s.*) - 'created_at' - 'updated_at'
  FROM public.seasons s WHERE s.id = p_season;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_season_source(
  p_season uuid, p_source text, p_enabled boolean, p_points jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO public.season_source_rules
    (season_id, source_type, enabled, points)
  VALUES (p_season, p_source, p_enabled, COALESCE(p_points, '{}'::jsonb))
  ON CONFLICT (season_id, source_type) DO UPDATE SET
    enabled = EXCLUDED.enabled, points = EXCLUDED.points;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_season_tier(
  p_season uuid, p_tier text, p_min_points int, p_min_rank int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  INSERT INTO public.season_tier_definitions
    (season_id, tier, min_points, min_rank)
  VALUES (p_season, p_tier, COALESCE(p_min_points, 0), p_min_rank)
  ON CONFLICT (season_id, tier) DO UPDATE SET
    min_points = EXCLUDED.min_points, min_rank = EXCLUDED.min_rank;
END;
$$;

-- Lifecycle: schedule / activate (freeze) / process / finalize / cancel.
CREATE OR REPLACE FUNCTION public.fn_schedule_season(p_season uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.seasons SET status = 'scheduled', updated_at = now()
  WHERE id = p_season AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  PERFORM public.fn_log_season(p_season, 'draft', 'scheduled', auth.uid());
END;
$$;

-- Freeze eligible participants (students + clans) at season start.
CREATE OR REPLACE FUNCTION public.fn_season_freeze(p_season uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min int;
  v_courses uuid[];
  v_n int := 0;
BEGIN
  SELECT COALESCE((eligibility ->> 'min_level')::int, 1) INTO v_min
  FROM public.seasons WHERE id = p_season;
  SELECT COALESCE(array_agg(x::uuid) FILTER (WHERE x ~ '^[0-9a-fA-F-]{36}$'), '{}')
    INTO v_courses
  FROM jsonb_array_elements_text(
    (SELECT COALESCE(eligibility -> 'course_ids', '[]'::jsonb)
     FROM public.seasons WHERE id = p_season)) AS x;
  INSERT INTO public.season_participants
    (season_id, participant_type, participant_id, display_name,
     course_id, batch_id, snapshot)
  SELECT p_season, 'student', p.id,
         COALESCE(NULLIF(p.full_name, ''), 'Player'),
         bm_course.course_id, bm_course.batch_id,
         jsonb_build_object('level', COALESCE(p.current_level, 1))
  FROM public.profiles p
  JOIN LATERAL (
    SELECT bm.batch_id, b.course_id FROM public.batch_members bm
    JOIN public.batches b ON b.id = bm.batch_id
    WHERE bm.user_id = p.id AND bm.is_active LIMIT 1
  ) AS bm_course ON true
  WHERE p.account_status = 'active'
    AND COALESCE(p.current_level, 1) >= v_min
    AND (v_courses = '{}' OR bm_course.course_id = ANY (v_courses))
  ON CONFLICT (season_id, participant_type, participant_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.season_participants
    (season_id, participant_type, participant_id, display_name,
     batch_id, snapshot)
  SELECT p_season, 'clan', c.id, c.name, c.batch_id,
         jsonb_build_object('batch_id', c.batch_id)
  FROM public.clans c
  WHERE c.status = 'active'
  ON CONFLICT (season_id, participant_type, participant_id) DO NOTHING;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_activate_season(p_season uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overlap text;
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT COALESCE(rules ->> 'overlap', 'GLOBAL_SINGLE') INTO v_overlap
  FROM public.seasons WHERE id = p_season;
  IF v_overlap = 'GLOBAL_SINGLE' AND EXISTS (
      SELECT 1 FROM public.seasons
      WHERE id <> p_season AND status = 'active') THEN
    RAISE EXCEPTION 'OVERLAP_FORBIDDEN';
  END IF;
  UPDATE public.seasons SET status = 'active', updated_at = now()
  WHERE id = p_season AND status = 'scheduled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  PERFORM public.fn_season_freeze(p_season);
  PERFORM public.fn_log_season(p_season, 'scheduled', 'active', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cancel_season(p_season uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.season_status;
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT status INTO v_status FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  UPDATE public.seasons SET status = 'cancelled', updated_at = now()
  WHERE id = p_season;
  PERFORM public.fn_log_season(p_season, v_status, 'cancelled', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_join_season(p_season uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_status public.season_status;
  v_min int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT status INTO v_status FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT COALESCE((eligibility ->> 'min_level')::int, 1) INTO v_min
  FROM public.seasons WHERE id = p_season;
  INSERT INTO public.season_participants
    (season_id, participant_type, participant_id, display_name, snapshot)
  SELECT p_season, 'student', v_me,
         COALESCE(NULLIF(full_name, ''), 'Player'),
         jsonb_build_object('level', COALESCE(current_level, 1))
  FROM public.profiles
  WHERE id = v_me AND account_status = 'active'
    AND COALESCE(current_level, 1) >= v_min
  ON CONFLICT (season_id, participant_type, participant_id) DO NOTHING;
  -- Re-join is idempotent (freeze may have enrolled earlier).
  IF NOT FOUND AND NOT EXISTS (
      SELECT 1 FROM public.season_participants
      WHERE season_id = p_season AND participant_type = 'student'
        AND participant_id = v_me) THEN
    RAISE EXCEPTION 'INELIGIBLE';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Point ingest: validated here, idempotent by key. Every call proves
-- the outcome against the source tables (finalized status, real
-- participation, policy-exact points), so open entry is safe: forged or
-- inflated points are rejected, replays collapse on the key.
CREATE OR REPLACE FUNCTION public.fn_record_season_points(
  p_season uuid, p_source text, p_source_id uuid,
  p_type text, p_pid uuid, p_points int, p_occurred timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.season_status;
  v_start timestamptz;
  v_end timestamptz;
  v_cfg jsonb;
  v_key text;
  v_cap int;
  v_sofar int;
  v_expect int;
  v_rank int;
  v_win boolean;
BEGIN
  SELECT status, start_at, end_at, scoring_policy
    INTO v_status, v_start, v_end, v_cfg
  FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status NOT IN ('active', 'processing') THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.season_source_rules
                 WHERE season_id = p_season AND source_type = p_source
                   AND enabled) THEN
    RETURN false;
  END IF;
  IF p_occurred IS NULL OR p_occurred < v_start OR p_occurred >= v_end THEN
    RETURN false;
  END IF;
  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.season_participants
                 WHERE season_id = p_season AND participant_type = p_type
                   AND participant_id = p_pid AND eligible) THEN
    RETURN false;
  END IF;
  -- Prove the outcome and the exact policy amount per source.
  IF p_source = 'COMPETITION' AND p_type = 'student' THEN
    SELECT rank INTO v_rank FROM public.competition_results
    WHERE competition_id = p_source_id AND scope = 'participant'
      AND ref_id = p_pid;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.competitions
                   WHERE id = p_source_id AND status = 'finalized') THEN
      RETURN false;
    END IF;
    v_expect := CASE v_rank
      WHEN 1 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'first')::int, 100)
      WHEN 2 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'second')::int, 60)
      WHEN 3 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'third')::int, 40)
      ELSE COALESCE((v_cfg -> 'COMPETITION' ->> 'participation')::int, 10) END;
  ELSIF p_source = 'COMPETITION' AND p_type = 'clan' THEN
    -- Clan rows carry the summed placements of all scoring members
    -- (one event per competition per clan; see sync aggregation).
    SELECT COALESCE(sum(CASE res.rank
      WHEN 1 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'first')::int, 100)
      WHEN 2 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'second')::int, 60)
      WHEN 3 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'third')::int, 40)
      ELSE COALESCE((v_cfg -> 'COMPETITION' ->> 'participation')::int, 10)
    END), 0)::int INTO v_expect
    FROM public.competition_results res
    JOIN public.competition_entries e
      ON e.competition_id = res.competition_id AND e.user_id = res.ref_id
    JOIN public.clans cl ON cl.batch_id = e.batch_id
    WHERE res.competition_id = p_source_id AND res.scope = 'participant'
      AND cl.id = p_pid;
    IF NOT FOUND OR v_expect IS NULL OR v_expect <= 0 THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.competitions
                   WHERE id = p_source_id AND status = 'finalized') THEN
      RETURN false;
    END IF;
  ELSIF p_source = 'CLAN_WAR' AND p_type = 'clan' THEN
    SELECT is_winner INTO v_win FROM public.clan_war_results
    WHERE war_id = p_source_id AND clan_id = p_pid;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clan_wars
                   WHERE id = p_source_id AND status = 'finalized') THEN
      RETURN false;
    END IF;
    v_expect := CASE WHEN v_win
      THEN COALESCE((v_cfg -> 'CLAN_WAR' ->> 'winner')::int, 500)
      ELSE COALESCE((v_cfg -> 'CLAN_WAR' ->> 'loser')::int, 200) END;
  ELSIF p_source = 'CLAN_BOSS' AND p_type = 'clan' THEN
    SELECT CASE WHEN br.outcome = 'defeated' THEN 1 ELSE 0 END INTO v_rank
    FROM public.boss_instances i
    LEFT JOIN public.boss_results br ON br.instance_id = i.id
    WHERE i.id = p_source_id AND i.clan_id = p_pid AND i.status = 'finalized';
    IF NOT FOUND OR v_rank IS NULL THEN
      RETURN false;
    END IF;
    v_expect := CASE WHEN v_rank = 1
      THEN COALESCE((v_cfg -> 'CLAN_BOSS' ->> 'defeat')::int, 300)
      ELSE COALESCE((v_cfg -> 'CLAN_BOSS' ->> 'participation')::int, 50) END;
  ELSIF p_source = 'CLAN_BOSS' AND p_type = 'student' THEN
    IF NOT EXISTS (SELECT 1 FROM public.boss_participants p
                   JOIN public.boss_instances i ON i.id = p.instance_id
                   WHERE p.instance_id = p_source_id AND p.user_id = p_pid
                     AND p.attempts_used > 0 AND i.status = 'finalized') THEN
      RETURN false;
    END IF;
    v_expect := COALESCE((v_cfg -> 'CLAN_BOSS' ->> 'member_participation')::int, 50);
  ELSIF p_source = 'MISSION' AND p_type = 'student' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mission_instances
                   WHERE id = p_source_id AND user_id = p_pid
                     AND status = 'completed') THEN
      RETURN false;
    END IF;
    v_expect := COALESCE((v_cfg -> 'MISSION' ->> 'points')::int, 5);
  ELSE
    RETURN false;
  END IF;
  IF p_points <> v_expect THEN
    RETURN false;
  END IF;
  SELECT COALESCE((points ->> 'daily_cap')::int, 0) INTO v_cap
  FROM public.season_source_rules
  WHERE season_id = p_season AND source_type = p_source;
  IF v_cap > 0 THEN
    SELECT COALESCE(sum(points), 0)::int INTO v_sofar
    FROM public.season_point_events
    WHERE season_id = p_season AND source_type = p_source
      AND participant_type = p_type AND participant_id = p_pid
      AND occurred_at >= date_trunc('day', p_occurred)
      AND occurred_at < date_trunc('day', p_occurred) + interval '1 day';
    IF v_sofar >= v_cap THEN
      RETURN false;
    END IF;
    p_points := LEAST(p_points, v_cap - v_sofar);
  END IF;
  v_key := 'season:' || p_season::text || ':source:' || p_source
    || ':' || p_source_id::text || ':participant:' || p_pid::text || ':v1';
  INSERT INTO public.season_point_events
    (key, season_id, source_type, source_id,
     participant_type, participant_id, points, occurred_at)
  VALUES (v_key, p_season, p_source, p_source_id,
    p_type, p_pid, p_points, p_occurred)
  ON CONFLICT (key) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Pull-model adapters: scan finalized source outcomes in-window.
-- Rerunnable; duplicates collapse on the event keys.
CREATE OR REPLACE FUNCTION public.fn_sync_season(p_season uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_cfg jsonb;
  v_n int := 0;
  r record;
  v_pts int;
BEGIN
  SELECT start_at, end_at, scoring_policy INTO v_start, v_end, v_cfg
  FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  -- COMPETITION: placement points to scorers + same points to their clans.
  IF EXISTS (SELECT 1 FROM public.season_source_rules
             WHERE season_id = p_season AND source_type = 'COMPETITION'
               AND enabled) THEN
    FOR r IN
      SELECT c.id AS comp_id, c.ends_at, res.ref_id AS user_id, res.rank
      FROM public.competitions c
      JOIN public.competition_results res ON res.competition_id = c.id
      WHERE c.status = 'finalized' AND res.scope = 'participant'
        AND c.ends_at >= v_start AND c.ends_at < v_end
    LOOP
      v_pts := CASE r.rank
        WHEN 1 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'first')::int, 100)
        WHEN 2 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'second')::int, 60)
        WHEN 3 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'third')::int, 40)
        ELSE COALESCE((v_cfg -> 'COMPETITION' ->> 'participation')::int, 10) END;
      IF public.fn_record_season_points(
          p_season, 'COMPETITION', r.comp_id, 'student', r.user_id,
          v_pts, r.ends_at) THEN
        v_n := v_n + 1;
      END IF;
    END LOOP;
    -- Clan rows aggregate all scoring members per competition (one key).
    FOR r IN
      SELECT r2.comp_id, r2.clan_id, sum(r2.pts)::int AS pts,
             max(r2.ends_at) AS ends_at
      FROM (
        SELECT c.id AS comp_id, c.ends_at, cl.id AS clan_id,
          CASE res.rank
            WHEN 1 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'first')::int, 100)
            WHEN 2 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'second')::int, 60)
            WHEN 3 THEN COALESCE((v_cfg -> 'COMPETITION' ->> 'third')::int, 40)
            ELSE COALESCE((v_cfg -> 'COMPETITION' ->> 'participation')::int, 10)
          END AS pts
        FROM public.competitions c
        JOIN public.competition_results res ON res.competition_id = c.id
        JOIN public.competition_entries e
          ON e.competition_id = c.id AND e.user_id = res.ref_id
        JOIN public.clans cl ON cl.batch_id = e.batch_id
        WHERE c.status = 'finalized' AND res.scope = 'participant'
          AND c.ends_at >= v_start AND c.ends_at < v_end
      ) AS r2
      GROUP BY r2.comp_id, r2.clan_id
    LOOP
      IF public.fn_record_season_points(
          p_season, 'COMPETITION', r.comp_id, 'clan', r.clan_id,
          r.pts, r.ends_at) THEN
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  -- CLAN_WAR: winner/loser clan points.
  IF EXISTS (SELECT 1 FROM public.season_source_rules
             WHERE season_id = p_season AND source_type = 'CLAN_WAR'
               AND enabled) THEN
    FOR r IN
      SELECT w.id AS war_id, w.finalized_at,
             res.clan_id, res.is_winner
      FROM public.clan_wars w
      JOIN public.clan_war_results res ON res.war_id = w.id
      WHERE w.status = 'finalized'
        AND w.finalized_at >= v_start AND w.finalized_at < v_end
    LOOP
      v_pts := CASE WHEN r.is_winner
        THEN COALESCE((v_cfg -> 'CLAN_WAR' ->> 'winner')::int, 500)
        ELSE COALESCE((v_cfg -> 'CLAN_WAR' ->> 'loser')::int, 200) END;
      IF public.fn_record_season_points(
          p_season, 'CLAN_WAR', r.war_id, 'clan', r.clan_id,
          v_pts, r.finalized_at) THEN
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  -- CLAN_BOSS: clan outcome points + individual participation.
  IF EXISTS (SELECT 1 FROM public.season_source_rules
             WHERE season_id = p_season AND source_type = 'CLAN_BOSS'
               AND enabled) THEN
    FOR r IN
      SELECT i.id AS inst_id, i.finalized_at, i.clan_id,
             (SELECT status FROM public.boss_instances WHERE id = i.id) AS st
      FROM public.boss_instances i
      WHERE i.status = 'finalized'
        AND i.finalized_at >= v_start AND i.finalized_at < v_end
    LOOP
      v_pts := CASE WHEN r.st = 'finalized'
          AND EXISTS (SELECT 1 FROM public.boss_results br
                      WHERE br.instance_id = r.inst_id AND br.outcome = 'defeated')
        THEN COALESCE((v_cfg -> 'CLAN_BOSS' ->> 'defeat')::int, 300)
        ELSE COALESCE((v_cfg -> 'CLAN_BOSS' ->> 'participation')::int, 50) END;
      IF public.fn_record_season_points(
          p_season, 'CLAN_BOSS', r.inst_id, 'clan', r.clan_id,
          v_pts, r.finalized_at) THEN
        v_n := v_n + 1;
      END IF;
    END LOOP;
    FOR r IN
      SELECT DISTINCT i.id AS inst_id, i.finalized_at, p.user_id
      FROM public.boss_instances i
      JOIN public.boss_participants p ON p.instance_id = i.id
      WHERE i.status = 'finalized' AND p.attempts_used > 0
        AND i.finalized_at >= v_start AND i.finalized_at < v_end
    LOOP
      IF public.fn_record_season_points(
          p_season, 'CLAN_BOSS', r.inst_id, 'student', r.user_id,
          COALESCE((v_cfg -> 'CLAN_BOSS' ->> 'member_participation')::int, 50),
          r.finalized_at) THEN
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  -- MISSION: completed instances award a flat configured amount.
  IF EXISTS (SELECT 1 FROM public.season_source_rules
             WHERE season_id = p_season AND source_type = 'MISSION'
               AND enabled) THEN
    FOR r IN
      SELECT i.id AS inst_id, i.completed_at, i.user_id
      FROM public.mission_instances i
      WHERE i.status = 'completed'
        AND i.completed_at >= v_start AND i.completed_at < v_end
    LOOP
      IF public.fn_record_season_points(
          p_season, 'MISSION', r.inst_id, 'student', r.user_id,
          COALESCE((v_cfg -> 'MISSION' ->> 'points')::int, 5),
          r.completed_at) THEN
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_n;
END;
$$;

-- Deterministic board: points → earliest event → participant id.
-- Privacy-safe: frozen display names only.
CREATE OR REPLACE FUNCTION public.fn_season_leaderboard(
  p_season uuid, p_type text, p_limit int DEFAULT 100
)
RETURNS TABLE (
  rank int,
  participant_id uuid,
  display_name text,
  points int,
  tier text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH totals AS (
    SELECT e.participant_id,
           sum(e.points)::int AS pts,
           min(e.occurred_at) AS first_at
    FROM public.season_point_events e
    WHERE e.season_id = p_season AND e.participant_type = p_type
    GROUP BY e.participant_id
  ), ranked AS (
    SELECT t.participant_id, t.pts, t.first_at,
           ROW_NUMBER() OVER (
             ORDER BY t.pts DESC, t.first_at ASC NULLS LAST,
                      t.participant_id ASC) AS rnk
    FROM totals t
  )
  SELECT r.rnk::int, r.participant_id,
         COALESCE((SELECT p.display_name
                   FROM public.season_participants p
                   WHERE p.season_id = p_season
                     AND p.participant_type = p_type
                     AND p.participant_id = r.participant_id),
                  'Player'),
         r.pts,
         (SELECT td.tier FROM public.season_tier_definitions td
          WHERE td.season_id = p_season AND td.min_points <= r.pts
            AND (td.min_rank IS NULL OR td.min_rank >= r.rnk)
          ORDER BY td.min_points DESC LIMIT 1)
  FROM ranked r
  ORDER BY r.rnk ASC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- Finalize: freeze, sync, rank, tier, snapshot, pay once, seal.
CREATE OR REPLACE FUNCTION public.fn_finalize_season(p_season uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.season_status;
  v_reward jsonb;
  r record;
  v_tier text;
  v_key text;
  v_xp int;
  v_coins int;
  v_n int := 0;
BEGIN
  SELECT status INTO v_status FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status = 'finalized' THEN
    RETURN jsonb_build_object('season_id', p_season, 'already', true);
  END IF;
  IF v_status <> 'processing' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  PERFORM public.fn_season_freeze(p_season);
  PERFORM public.fn_sync_season(p_season);
  SELECT reward_policy INTO v_reward FROM public.seasons WHERE id = p_season;
  FOR r IN SELECT * FROM public.fn_season_leaderboard(p_season, 'student', 1000000)
  LOOP
    v_tier := r.tier;
    INSERT INTO public.season_results
      (season_id, participant_type, participant_id, display_name,
       points, rank, tier, details)
    VALUES (p_season, 'student', r.participant_id, r.display_name,
      r.points, r.rank, v_tier,
      jsonb_build_object('tier', v_tier))
    ON CONFLICT DO NOTHING;
    v_key := 'season:' || p_season::text || ':participant:'
      || r.participant_id::text || ':final:v1';
    IF r.rank = 1 THEN
      v_xp := COALESCE((v_reward -> 'individual' ->> 'first_xp')::int,
                COALESCE((v_reward ->> 'first_xp')::int, 500));
      v_coins := COALESCE((v_reward -> 'individual' ->> 'first_coins')::int,
                   COALESCE((v_reward ->> 'first_coins')::int, 50));
    ELSIF r.rank = 2 THEN
      v_xp := COALESCE((v_reward -> 'individual' ->> 'second_xp')::int,
                COALESCE((v_reward ->> 'second_xp')::int, 300));
      v_coins := COALESCE((v_reward -> 'individual' ->> 'second_coins')::int,
                   COALESCE((v_reward ->> 'second_coins')::int, 30));
    ELSIF r.rank = 3 THEN
      v_xp := COALESCE((v_reward -> 'individual' ->> 'third_xp')::int,
                COALESCE((v_reward ->> 'third_xp')::int, 200));
      v_coins := COALESCE((v_reward -> 'individual' ->> 'third_coins')::int,
                   COALESCE((v_reward ->> 'third_coins')::int, 20));
    ELSE
      v_xp := COALESCE((v_reward -> 'individual' ->> 'participation_xp')::int,
                COALESCE((v_reward ->> 'participation_xp')::int, 20));
      v_coins := COALESCE((v_reward -> 'individual' ->> 'participation_coins')::int,
                   COALESCE((v_reward ->> 'participation_coins')::int, 2));
    END IF;
    INSERT INTO public.season_reward_events
      (key, season_id, participant_type, participant_id, xp, coins)
    VALUES (v_key, p_season, 'student', r.participant_id, v_xp, v_coins)
    ON CONFLICT (key) DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.reward_events (key, user_id, attempt_id)
      VALUES (v_key, r.participant_id, NULL)
      ON CONFLICT (key) DO NOTHING;
      IF v_xp > 0 THEN
        INSERT INTO public.xp_ledger
          (user_id, amount, source, source_type, reference_id, reason,
           metadata, balance_after)
        SELECT r.participant_id, v_xp, 'season', 'season', v_key,
               'season final reward',
               jsonb_build_object('season_id', p_season, 'rank', r.rank),
               COALESCE(xp_total, 0) + v_xp
        FROM public.profiles WHERE id = r.participant_id
        ON CONFLICT (user_id, source, reference_id) DO NOTHING;
        UPDATE public.profiles SET xp_total = xp_total + v_xp,
          current_level = (SELECT max(level) FROM public.levels
                           WHERE required_xp <= xp_total + v_xp)
        WHERE id = r.participant_id AND EXISTS (
          SELECT 1 FROM public.xp_ledger
          WHERE user_id = r.participant_id AND reference_id = v_key);
      END IF;
      IF v_coins > 0 THEN
        INSERT INTO public.coin_ledger
          (user_id, amount, source, source_type, reference_id, reason,
           metadata, balance_after)
        SELECT r.participant_id, v_coins, 'season', 'season', v_key,
               'season final reward',
               jsonb_build_object('season_id', p_season, 'rank', r.rank),
               COALESCE(coin_balance, 0) + v_coins
        FROM public.profiles WHERE id = r.participant_id
        ON CONFLICT (user_id, source, reference_id) DO NOTHING;
        UPDATE public.profiles SET coin_balance = coin_balance + v_coins
        WHERE id = r.participant_id AND EXISTS (
          SELECT 1 FROM public.coin_ledger
          WHERE user_id = r.participant_id AND reference_id = v_key);
      END IF;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM public.fn_season_leaderboard(p_season, 'clan', 1000000)
  LOOP
    INSERT INTO public.season_results
      (season_id, participant_type, participant_id, display_name,
       points, rank, tier, details)
    VALUES (p_season, 'clan', r.participant_id, r.display_name,
      r.points, r.rank, r.tier,
      jsonb_build_object('tier', r.tier, 'honor', true))
    ON CONFLICT DO NOTHING;
    -- Clan honors are recorded, never ledgered (no clan balances exist).
    INSERT INTO public.season_reward_events
      (key, season_id, participant_type, participant_id, xp, coins)
    VALUES ('season:' || p_season::text || ':participant:'
      || r.participant_id::text || ':final:v1',
      p_season, 'clan', r.participant_id, 0, 0)
    ON CONFLICT (key) DO NOTHING;
  END LOOP;
  INSERT INTO public.season_leaderboard_snapshots
    (season_id, participant_type, board)
  SELECT p_season, t.ptype,
         COALESCE(jsonb_agg(jsonb_build_object(
           'rank', b.rank, 'participant_id', b.participant_id,
           'display_name', b.display_name, 'points', b.points,
           'tier', b.tier) ORDER BY b.rank), '[]'::jsonb)
  FROM (VALUES ('student'), ('clan')) AS t(ptype)
  LEFT JOIN LATERAL (
    SELECT * FROM public.fn_season_leaderboard(p_season, t.ptype, 1000000)
  ) AS b ON true
  GROUP BY t.ptype
  ON CONFLICT (season_id, participant_type) DO NOTHING;
  UPDATE public.seasons
  SET status = 'finalized', finalized_at = now(), updated_at = now()
  WHERE id = p_season;
  PERFORM public.fn_log_season(p_season, 'processing', 'finalized', auth.uid());
  RETURN jsonb_build_object('season_id', p_season, 'rewards', v_n);
END;
$$;

-- Audited corrections only (history is never silently rewritten).
CREATE OR REPLACE FUNCTION public.fn_season_adjust(
  p_season uuid, p_type text, p_pid uuid, p_patch jsonb, p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT to_jsonb(r.*) INTO v_old FROM public.season_results r
  WHERE season_id = p_season AND participant_type = p_type
    AND participant_id = p_pid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO public.season_adjustments
    (season_id, participant_type, participant_id, old_value, new_value,
     reason, created_by)
  VALUES (p_season, p_type, p_pid, v_old,
    COALESCE(p_patch, '{}'::jsonb), p_reason, auth.uid());
END;
$$;

-- Scheduler sweep: activate due, settle overdue. Manual triggers remain
-- available via fn_advance_season for recovery and testing.
CREATE OR REPLACE FUNCTION public.fn_season_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.seasons WHERE status = 'scheduled'
  LOOP
    BEGIN
      PERFORM public.fn_activate_season_sweep(r.id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  FOR r IN SELECT id FROM public.seasons
           WHERE status = 'active' AND end_at <= now()
  LOOP
    UPDATE public.seasons SET status = 'processing', updated_at = now()
    WHERE id = r.id;
    PERFORM public.fn_log_season(r.id, 'active', 'processing', NULL);
    PERFORM public.fn_finalize_season(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_activate_season_sweep(p_season uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.season_status;
  v_start timestamptz;
  v_overlap text;
BEGIN
  SELECT status, start_at INTO v_status, v_start
  FROM public.seasons WHERE id = p_season;
  IF NOT FOUND OR v_status <> 'scheduled' THEN
    RETURN;
  END IF;
  IF v_start IS NULL OR v_start > now() THEN
    RETURN;
  END IF;
  SELECT COALESCE(rules ->> 'overlap', 'GLOBAL_SINGLE') INTO v_overlap
  FROM public.seasons WHERE id = p_season;
  IF v_overlap = 'GLOBAL_SINGLE' AND EXISTS (
      SELECT 1 FROM public.seasons
      WHERE id <> p_season AND status = 'active') THEN
    RETURN;
  END IF;
  UPDATE public.seasons SET status = 'active', updated_at = now()
  WHERE id = p_season;
  PERFORM public.fn_season_freeze(p_season);
  PERFORM public.fn_log_season(p_season, 'scheduled', 'active', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_advance_season(p_season uuid)
RETURNS public.season_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.season_status;
BEGIN
  SELECT status INTO v_status FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_status = 'scheduled' THEN
    PERFORM public.fn_activate_season_sweep(p_season);
  ELSIF v_status = 'active' THEN
    UPDATE public.seasons SET status = 'processing', updated_at = now()
    WHERE id = p_season;
    PERFORM public.fn_log_season(p_season, 'active', 'processing', auth.uid());
    PERFORM public.fn_finalize_season(p_season);
  END IF;
  SELECT status INTO v_status FROM public.seasons WHERE id = p_season;
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_season(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_season(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_update_season_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_season_draft(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_season_source(uuid, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_season_source(uuid, text, boolean, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_season_tier(uuid, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_season_tier(uuid, text, int, int) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_schedule_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_activate_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cancel_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancel_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_join_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_join_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_record_season_points(uuid, text, uuid, text, uuid, int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_season_points(uuid, text, uuid, text, uuid, int, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_season_leaderboard(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_season_leaderboard(uuid, text, int) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_finalize_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_season_adjust(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_season_adjust(uuid, text, uuid, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_season_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_season_sweep() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_advance_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_season(uuid) TO authenticated;
