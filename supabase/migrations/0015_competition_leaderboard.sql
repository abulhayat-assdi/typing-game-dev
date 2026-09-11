-- M8 additive read model: server-derived competition leaderboard.
--
-- RLS on competition_results only exposes a participant's OWN row while a
-- competition is live, so a live leaderboard cannot be assembled from
-- PostgREST reads. This SECURITY DEFINER function returns the public
-- leaderboard projection (rank, display name, batch, score, wpm, accuracy,
-- attempts, is_me) with no private account data. No M2-M7 object touched.
--
-- Access rule (enforced inside the function, RLS stays authoritative):
-- caller must manage the competition, hold an entry, or the competition
-- must be finalized. Otherwise zero rows (no oracle).

CREATE OR REPLACE FUNCTION public.fn_competition_leaderboard(p_competition uuid)
RETURNS TABLE (
  rank int,
  display_name text,
  batch_title text,
  score numeric,
  wpm numeric,
  accuracy numeric,
  attempts int,
  is_me boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_status public.competition_status;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  SELECT status INTO v_status
  FROM public.competitions WHERE id = p_competition;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_status <> 'finalized'
    AND NOT public.fn_can_manage_competition(p_competition)
    AND NOT EXISTS (
      SELECT 1 FROM public.competition_entries e
      WHERE e.competition_id = p_competition AND e.user_id = v_me
    ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT r.rank,
         COALESCE(NULLIF(p.full_name, ''), 'Player') AS display_name,
         COALESCE(b.name, '') AS batch_title,
         r.score, r.wpm, r.accuracy, r.attempts,
         (e.user_id = v_me) AS is_me
  FROM public.competition_results r
  LEFT JOIN public.competition_entries e
    ON e.competition_id = r.competition_id AND e.user_id = r.ref_id
  LEFT JOIN public.profiles p ON p.id = r.ref_id
  LEFT JOIN public.batches b ON b.id = e.batch_id
  WHERE r.competition_id = p_competition AND r.scope = 'participant'
  ORDER BY r.rank ASC, r.ref_id ASC;
END;
$$;
