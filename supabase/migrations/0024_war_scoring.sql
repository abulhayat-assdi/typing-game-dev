-- M11 war scoring: submissions reference M4 attempts; aggregates reuse
-- the contribution-metric family; rewards flow through M5 ledgers.
-- War score NEVER mutates clan XP (ordinary clan_contributions still come
-- from the validated-attempt trigger exactly once).

-- Submit one validated attempt into a live war.
CREATE OR REPLACE FUNCTION public.fn_submit_war_attempt(
  p_war uuid, p_attempt uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_war record;
  v_att record;
  v_res record;
  v_part record;
  v_limit int;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_war.status <> 'live' THEN
    RAISE EXCEPTION 'NOT_LIVE';
  END IF;
  SELECT * INTO v_part FROM public.clan_war_participants
  WHERE war_id = p_war AND user_id = v_me;
  IF NOT FOUND OR NOT v_part.eligible THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;
  SELECT * INTO v_att FROM public.game_attempts WHERE id = p_attempt;
  IF NOT FOUND OR v_att.user_id <> v_me THEN
    RAISE EXCEPTION 'ATTEMPT_FORBIDDEN';
  END IF;
  IF v_att.status <> 'validated' THEN
    RAISE EXCEPTION 'NOT_VALIDATED';
  END IF;
  IF v_att.submitted_at IS NULL
     OR v_att.submitted_at < v_war.battle_start
     OR v_att.submitted_at >= v_war.battle_end THEN
    RAISE EXCEPTION 'OUTSIDE_WINDOW';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_war_games
             WHERE war_id = p_war)
     AND NOT EXISTS (SELECT 1 FROM public.clan_war_games
                     WHERE war_id = p_war AND game_id = v_att.game_id) THEN
    RAISE EXCEPTION 'GAME_NOT_ALLOWED';
  END IF;
  SELECT * INTO v_res FROM public.attempt_results WHERE attempt_id = p_attempt;
  IF NOT FOUND OR NOT v_res.is_valid THEN
    RAISE EXCEPTION 'NOT_VALIDATED';
  END IF;
  v_limit := COALESCE((v_war.rules ->> 'attempts_per_player')::int, 5);
  IF v_part.attempts_used >= v_limit THEN
    RAISE EXCEPTION 'ATTEMPT_LIMIT';
  END IF;
  INSERT INTO public.clan_war_attempts
    (war_id, user_id, attempt_id, score, submitted_at)
  VALUES (p_war, v_me, p_attempt, v_res.score, v_att.submitted_at)
  ON CONFLICT (attempt_id) DO NOTHING
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DUPLICATE';
  END IF;
  UPDATE public.clan_war_participants
  SET attempts_used = attempts_used + 1,
      best_score = GREATEST(COALESCE(best_score, 0), v_res.score)
  WHERE war_id = p_war AND user_id = v_me;
  RETURN v_id;
END;
$$;

-- Recompute per-user war contributions (read-only; safe to call often).
CREATE OR REPLACE FUNCTION public.fn_sync_war(p_war uuid)
RETURNS public.clan_war_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_policy text;
  v_mode text;
  v_topn int;
  r record;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_war.status NOT IN ('live', 'processing') THEN
    RETURN v_war.status;
  END IF;
  v_policy := COALESCE(v_war.scoring_profile ->> 'player_policy', 'best_score');
  v_mode := COALESCE(v_war.scoring_profile ->> 'mode', 'sum');
  v_topn := GREATEST(COALESCE((v_war.scoring_profile ->> 'top_n')::int, 3), 1);
  FOR r IN SELECT user_id, clan_id FROM public.clan_war_participants
           WHERE war_id = p_war AND eligible
  LOOP
    WITH mine AS (
      SELECT wa.score, res.effective_wpm AS wpm, res.accuracy AS acc
      FROM public.clan_war_attempts wa
      JOIN public.attempt_results res ON res.attempt_id = wa.attempt_id
      WHERE wa.war_id = p_war AND wa.user_id = r.user_id
    ), one AS (
      SELECT
        CASE v_policy
          WHEN 'best_wpm' THEN COALESCE((SELECT max(wpm) FROM mine), 0)
          WHEN 'best_accuracy' THEN COALESCE((SELECT max(acc) FROM mine), 0)
          WHEN 'sum' THEN COALESCE((SELECT sum(score) FROM mine), 0)
          ELSE COALESCE((SELECT max(score) FROM mine), 0) END AS s,
        (SELECT count(*)::int FROM mine) AS n,
        (SELECT max(wpm) FROM mine) AS w,
        (SELECT max(acc) FROM mine) AS a
    )
    INSERT INTO public.clan_war_contributions
      (war_id, clan_id, user_id, score, attempts, best_wpm, best_accuracy)
    SELECT p_war, r.clan_id, r.user_id, s, n, w, a FROM one
    ON CONFLICT (war_id, user_id) DO UPDATE SET
      score = EXCLUDED.score, attempts = EXCLUDED.attempts,
      best_wpm = EXCLUDED.best_wpm, best_accuracy = EXCLUDED.best_accuracy;
  END LOOP;
  RETURN v_war.status;
END;
$$;

-- Finalize: clan totals per scoring mode, deterministic ties, one reward
-- pass. Immutable afterwards (results PK + status guard).
CREATE OR REPLACE FUNCTION public.fn_finalize_war(p_war uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_mode text;
  v_topn int;
  v_ch record;
  v_df record;
  v_row record;
  v_winner uuid;
  v_loser uuid;
  v_key text;
  v_uid uuid;
  v_xp int;
  v_coins int;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_war.status = 'finalized' THEN
    RETURN jsonb_build_object('war_id', p_war, 'already', true);
  END IF;
  IF v_war.status <> 'processing' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  PERFORM public.fn_sync_war(p_war);
  v_mode := COALESCE(v_war.scoring_profile ->> 'mode', 'sum');
  v_topn := GREATEST(COALESCE((v_war.scoring_profile ->> 'top_n')::int, 3), 1);

  -- Per-clan aggregates with tie inputs (avg accuracy, best, count,
  -- earliest submission), deterministic ordering.
  FOR v_row IN
    WITH per_clan AS (
      SELECT c.clan_id,
        CASE v_mode
          WHEN 'top_n' THEN COALESCE((
            SELECT sum(x.s) FROM (
              SELECT cc.score AS s FROM public.clan_war_contributions cc
              WHERE cc.war_id = p_war AND cc.clan_id = c.clan_id
              ORDER BY cc.score DESC LIMIT v_topn) x), 0)
          WHEN 'average' THEN COALESCE((
            SELECT avg(cc.score) FROM public.clan_war_contributions cc
            WHERE cc.war_id = p_war AND cc.clan_id = c.clan_id), 0)
          ELSE COALESCE((
            SELECT sum(cc.score) FROM public.clan_war_contributions cc
            WHERE cc.war_id = p_war AND cc.clan_id = c.clan_id), 0) END AS total,
        COALESCE((SELECT avg(cc.best_accuracy)
          FROM public.clan_war_contributions cc
          WHERE cc.war_id = p_war AND cc.clan_id = c.clan_id), 0) AS acc,
        COALESCE((SELECT max(cc.score)
          FROM public.clan_war_contributions cc
          WHERE cc.war_id = p_war AND cc.clan_id = c.clan_id), 0) AS best,
        COALESCE((SELECT count(*)
          FROM public.clan_war_contributions cc
          WHERE cc.war_id = p_war AND cc.clan_id = c.clan_id
            AND cc.attempts > 0), 0) AS parts,
        (SELECT min(wa.submitted_at) FROM public.clan_war_attempts wa
         WHERE wa.war_id = p_war AND wa.user_id IN (
           SELECT user_id FROM public.clan_war_participants p2
           WHERE p2.war_id = p_war AND p2.clan_id = c.clan_id)) AS earliest
      FROM (SELECT v_war.challenger_clan_id AS clan_id
            UNION ALL SELECT v_war.defender_clan_id) c
    )
    SELECT *, ROW_NUMBER() OVER (
        ORDER BY total DESC, acc DESC, best DESC, parts DESC,
                 earliest ASC NULLS LAST) AS rnk
    FROM per_clan
  LOOP
    IF v_row.clan_id = v_war.challenger_clan_id THEN
      v_ch := v_row;
    ELSE
      v_df := v_row;
    END IF;
  END LOOP;
  IF v_ch.rnk = 1 THEN
    v_winner := v_war.challenger_clan_id;
    v_loser := v_war.defender_clan_id;
  ELSE
    v_winner := v_war.defender_clan_id;
    v_loser := v_war.challenger_clan_id;
  END IF;

  INSERT INTO public.clan_war_results
    (war_id, clan_id, total_score, participants, rank, is_winner)
  VALUES
    (p_war, v_war.challenger_clan_id, v_ch.total, v_ch.parts, v_ch.rnk, v_ch.rnk = 1),
    (p_war, v_war.defender_clan_id, v_df.total, v_df.parts, v_df.rnk, v_df.rnk = 1)
  ON CONFLICT DO NOTHING;

  -- Rewards: participation for every contributor, winner bonus for the
  -- winning clan's contributors. One key per member, never twice.
  FOR v_uid IN SELECT user_id FROM public.clan_war_contributions
               WHERE war_id = p_war AND attempts > 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.clan_war_participants p2
               WHERE p2.war_id = p_war AND p2.user_id = v_uid
                 AND p2.clan_id = v_winner) THEN
      v_xp := COALESCE((v_war.reward_policy ->> 'winner_xp')::int, 0);
      v_coins := COALESCE((v_war.reward_policy ->> 'winner_coins')::int, 0);
    ELSE
      v_xp := COALESCE((v_war.reward_policy ->> 'participant_xp')::int, 0);
      v_coins := COALESCE((v_war.reward_policy ->> 'participant_coins')::int, 0);
    END IF;
    v_key := 'war:' || p_war::text || ':member:' || v_uid::text || ':reward:v1';
    INSERT INTO public.clan_war_reward_events (key, war_id, user_id, xp, coins)
    VALUES (v_key, p_war, v_uid, v_xp, v_coins)
    ON CONFLICT (key) DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.reward_events (key, user_id, attempt_id)
      VALUES (v_key, v_uid, NULL)
      ON CONFLICT (key) DO NOTHING;
      IF v_xp > 0 THEN
        INSERT INTO public.xp_ledger
          (user_id, amount, source, source_type, reference_id, reason,
           metadata, balance_after)
        SELECT v_uid, v_xp, 'war', 'war', v_key, 'clan war reward',
               jsonb_build_object('war_id', p_war), COALESCE(xp_total, 0) + v_xp
        FROM public.profiles WHERE id = v_uid
        ON CONFLICT (user_id, source, reference_id) DO NOTHING;
        UPDATE public.profiles SET xp_total = xp_total + v_xp,
          current_level = (SELECT max(level) FROM public.levels
                           WHERE required_xp <= xp_total + v_xp)
        WHERE id = v_uid AND EXISTS (
          SELECT 1 FROM public.xp_ledger
          WHERE user_id = v_uid AND reference_id = v_key);
      END IF;
      IF v_coins > 0 THEN
        INSERT INTO public.coin_ledger
          (user_id, amount, source, source_type, reference_id, reason,
           metadata, balance_after)
        SELECT v_uid, v_coins, 'war', 'war', v_key, 'clan war reward',
               jsonb_build_object('war_id', p_war), COALESCE(coin_balance, 0) + v_coins
        FROM public.profiles WHERE id = v_uid
        ON CONFLICT (user_id, source, reference_id) DO NOTHING;
        UPDATE public.profiles SET coin_balance = coin_balance + v_coins
        WHERE id = v_uid AND EXISTS (
          SELECT 1 FROM public.coin_ledger
          WHERE user_id = v_uid AND reference_id = v_key);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.clan_wars
  SET status = 'finalized', finalized_at = now(), updated_at = now()
  WHERE id = p_war;
  PERFORM public.fn_log_war(p_war, 'processing', 'finalized', auth.uid());
  RETURN jsonb_build_object('war_id', p_war, 'winner_clan_id', v_winner);
END;
$$;

-- Privacy-safe board: clan totals + own-clan roster + opponent top 5.
CREATE OR REPLACE FUNCTION public.fn_war_board(p_war uuid)
RETURNS TABLE (
  scope text,
  clan_id uuid,
  display_name text,
  score numeric,
  attempts int,
  is_me boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_mine uuid;
BEGIN
  IF NOT public.fn_is_war_viewer(p_war) THEN
    RETURN;
  END IF;
  SELECT m.clan_id INTO v_mine FROM public.clan_members m
  WHERE m.user_id = v_me AND m.status = 'active' LIMIT 1;
  RETURN QUERY
  SELECT 'clan'::text, r.clan_id, c.name, r.total_score, r.participants, false
  FROM public.clan_war_results r
  JOIN public.clans c ON c.id = r.clan_id
  WHERE r.war_id = p_war
  UNION ALL
  SELECT 'clan_live'::text, cc.clan_id, c.name,
         COALESCE(sum(cc.score), 0), COALESCE(sum(cc.attempts), 0)::int, false
  FROM public.clan_war_contributions cc
  JOIN public.clans c ON c.id = cc.clan_id
  WHERE cc.war_id = p_war
    AND NOT EXISTS (SELECT 1 FROM public.clan_war_results r2
                    WHERE r2.war_id = p_war)
  GROUP BY cc.clan_id, c.name
  UNION ALL
  SELECT 'member'::text, cc.clan_id,
         COALESCE(NULLIF(p.full_name, ''), 'Player'),
         cc.score, cc.attempts, (cc.user_id = v_me)
  FROM public.clan_war_contributions cc
  JOIN public.profiles p ON p.id = cc.user_id
  WHERE cc.war_id = p_war AND cc.attempts > 0
    AND (cc.clan_id = v_mine OR cc.user_id = v_me
      OR cc.user_id IN (
        SELECT cc2.user_id FROM public.clan_war_contributions cc2
        WHERE cc2.war_id = p_war AND cc2.clan_id <> COALESCE(v_mine, '00000000-0000-0000-0000-000000000000')
          AND cc2.attempts > 0
        ORDER BY cc2.score DESC LIMIT 5))
  ORDER BY 1, 4 DESC;
END;
$$;

-- Audited corrections on non-finalized wars (history stays immutable).
CREATE OR REPLACE FUNCTION public.fn_war_adjust(
  p_war uuid, p_scope text, p_ref uuid, p_patch jsonb, p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_old jsonb;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_war.status = 'finalized' THEN
    RAISE EXCEPTION 'IMMUTABLE';
  END IF;
  IF NOT public.fn_can_manage_clan(v_war.challenger_clan_id)
    AND NOT public.fn_can_manage_clan(v_war.defender_clan_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT to_jsonb(c.*) INTO v_old FROM public.clan_war_contributions c
  WHERE war_id = p_war AND user_id = p_ref;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  UPDATE public.clan_war_contributions
  SET score = COALESCE((p_patch ->> 'score')::numeric, score)
  WHERE war_id = p_war AND user_id = p_ref;
  INSERT INTO public.clan_war_adjustments
    (war_id, scope, ref_id, old_value, new_value, reason, created_by)
  VALUES (p_war, p_scope, p_ref, v_old,
    (SELECT to_jsonb(c.*) FROM public.clan_war_contributions c
     WHERE war_id = p_war AND user_id = p_ref),
    p_reason, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.fn_submit_war_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_war_attempt(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_war(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_war(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_finalize_war(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_war(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_war_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_war_board(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_war_adjust(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_war_adjust(uuid, text, uuid, jsonb, text) TO authenticated;
