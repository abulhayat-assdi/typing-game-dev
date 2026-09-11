-- M6 0010: batch leaderboard read function (additive; no M2 changes).
--
-- Why a function: M2 RLS correctly hides peer profiles from students, so a
-- batch leaderboard cannot be assembled client-side. This SECURITY DEFINER
-- function discloses ONLY the explicitly public leaderboard fields, and only
-- to active members of that batch (or assigned staff / admins / super_admin).
-- Route params can never widen access: the membership gate runs inside.
-- Windows use UTC day boundaries (documented; streaks keep personal zones).

CREATE OR REPLACE FUNCTION public.fn_batch_leaderboard(
  p_batch_id uuid,
  p_window text DEFAULT 'all',
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  full_name text,
  roll_number text,
  level int,
  xp_total int,
  xp_window int,
  attempts bigint,
  avg_wpm numeric,
  avg_accuracy numeric,
  streak_current int,
  badges jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_since timestamptz := NULL;
  v_lim int := LEAST(GREATEST(p_limit, 1), 100);
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_window NOT IN ('today', 'week', 'month', 'all') THEN
    RAISE EXCEPTION 'INVALID_WINDOW';
  END IF;
  -- Gate: active member of this batch, or staff covering it.
  IF NOT (
    public.is_batch_member(p_batch_id)
    OR public.is_teacher_of_batch(p_batch_id)
    OR public.is_org_admin(public.batch_organization_id(p_batch_id))
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  v_since := CASE p_window
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week' THEN date_trunc('day', now()) - interval '6 days'
    WHEN 'month' THEN date_trunc('day', now()) - interval '29 days'
    ELSE NULL
  END;

  RETURN QUERY
  WITH members AS (
    SELECT bm.user_id, bm.roll_number
    FROM public.batch_members bm
    WHERE bm.batch_id = p_batch_id AND bm.is_active
  ),
  window_xp AS (
    SELECT l.user_id, COALESCE(sum(l.amount), 0)::int AS xp
    FROM public.xp_ledger l
    WHERE (v_since IS NULL OR l.created_at >= v_since)
      AND l.amount > 0
    GROUP BY l.user_id
  ),
  window_runs AS (
    SELECT a.user_id,
           count(*)::bigint AS n,
           COALESCE(avg(r.effective_wpm), 0)::numeric AS wpm,
           COALESCE(avg(r.accuracy), 0)::numeric AS acc
    FROM public.game_attempts a
    JOIN public.attempt_results r ON r.attempt_id = a.id
    WHERE r.is_valid
      AND (v_since IS NULL OR r.validated_at >= v_since)
    GROUP BY a.user_id
  ),
  ranked AS (
    SELECT
      m.user_id,
      p.full_name,
      m.roll_number,
      p.current_level AS level,
      p.xp_total,
      COALESCE(x.xp, 0) AS xp_window,
      COALESCE(w.n, 0) AS attempts,
      COALESCE(w.wpm, 0) AS avg_wpm,
      COALESCE(w.acc, 0) AS avg_accuracy,
      COALESCE(s.current_count, 0) AS streak_current,
      COALESCE(
        (SELECT jsonb_agg(badge_id ORDER BY awarded_at DESC)
         FROM (SELECT ba.badge_id, ba.awarded_at FROM public.badge_awards ba
               WHERE ba.user_id = m.user_id
               ORDER BY ba.awarded_at DESC LIMIT 3) b),
        '[]'::jsonb
      ) AS badges
    FROM members m
    JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN window_xp x ON x.user_id = m.user_id
    LEFT JOIN window_runs w ON w.user_id = m.user_id
    LEFT JOIN public.streaks s ON s.user_id = m.user_id
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY r.xp_window DESC, r.avg_accuracy DESC, r.avg_wpm DESC, r.full_name ASC
    ),
    r.user_id, r.full_name, r.roll_number, r.level, r.xp_total, r.xp_window,
    r.attempts, r.avg_wpm, r.avg_accuracy, r.streak_current, r.badges
  FROM ranked r
  ORDER BY 1
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION
  public.fn_batch_leaderboard(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_batch_leaderboard(uuid, text, int) TO authenticated;
