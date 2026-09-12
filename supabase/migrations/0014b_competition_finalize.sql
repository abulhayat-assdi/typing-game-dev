-- M8 0014b: finalize + adjustments (same file family as 0014 ops).

-- ---------------------------------------------------------------------------
-- Finalize: representative per entry → deterministic ranking → immutable
-- results → ledger rewards (idempotent keys). Single transaction: any failure
-- rolls everything back, and re-running is safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finalize_competition(p_competition uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_comp public.competitions%ROWTYPE;
  v_scoring jsonb;
  v_metric text;
  v_wpm_cap numeric;
  v_wpm_w numeric;
  v_acc_w numeric;
  v_entry record;
  v_rows int := 0;
  v_rewards int := 0;
  v_batches int := 0;
  v_order text;
  v_key text;
  v_sql text;
  v_badge text;
  v_reward jsonb;
  v_xp int;
  v_coins int;
  v_rep record;
  v_ranked record;
  v_b record;
  v_agg numeric;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.fn_can_manage_competition(p_competition) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_comp.status <> 'processing' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;

  v_scoring := COALESCE(v_comp.scoring, '{"metric":"score"}'::jsonb);
  v_metric := COALESCE(v_scoring ->> 'metric', 'score');
  v_wpm_cap := GREATEST(COALESCE((v_scoring ->> 'wpmCap')::numeric, 100), 1);
  v_wpm_w := COALESCE((v_scoring ->> 'wpmWeight')::numeric, 0.5);
  v_acc_w := COALESCE((v_scoring ->> 'accuracyWeight')::numeric, 0.5);
  v_reward := COALESCE(v_comp.reward_policy, '{}'::jsonb);

  IF v_reward ? 'badge_first'
     AND NOT EXISTS (
       SELECT 1 FROM public.badges
       WHERE id = (v_reward ->> 'badge_first') AND is_active) THEN
    RAISE EXCEPTION 'REWARD_BADGE_UNKNOWN';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS comp_work (
    entry_id uuid,
    user_id uuid,
    batch_id uuid,
    value numeric,
    accuracy numeric,
    wpm numeric,
    errors int,
    submitted_at timestamptz,
    attempt_id uuid
  ) ON COMMIT DROP;
  TRUNCATE comp_work;

  -- One representative row per registered entry.
  FOR v_entry IN
    SELECT e.id, e.user_id, e.batch_id
    FROM public.competition_entries e
    WHERE e.competition_id = p_competition AND e.status = 'registered'
  LOOP
    SELECT
      CASE
        WHEN v_comp.attempt_policy = 'AVERAGE_TOP_3' THEN (
          SELECT avg(x.v) FROM (
            SELECT comp_metric_value(
              (r.score)::numeric, (r.accuracy)::numeric, (r.effective_wpm)::numeric,
              v_metric, v_wpm_cap, v_wpm_w, v_acc_w) AS v
            FROM public.competition_attempts ca
            JOIN public.game_attempts ga ON ga.id = ca.attempt_id
            JOIN public.attempt_results r ON r.attempt_id = ga.id
            WHERE ca.entry_id = v_entry.id
              AND ga.status = 'validated' AND r.is_valid
            ORDER BY 1 DESC LIMIT 3
          ) x
        )
        ELSE (
          SELECT comp_metric_value(
            (r.score)::numeric, (r.accuracy)::numeric, (r.effective_wpm)::numeric,
            v_metric, v_wpm_cap, v_wpm_w, v_acc_w)
          FROM public.competition_attempts ca
          JOIN public.game_attempts ga ON ga.id = ca.attempt_id
          JOIN public.attempt_results r ON r.attempt_id = ga.id
          WHERE ca.entry_id = v_entry.id
            AND ga.status = 'validated' AND r.is_valid
          ORDER BY
            CASE WHEN v_comp.attempt_policy = 'BEST_ACCURACY' THEN r.accuracy END DESC,
            CASE WHEN v_comp.attempt_policy = 'BEST_WPM' THEN r.effective_wpm END DESC,
            CASE WHEN v_comp.attempt_policy = 'LATEST_VALID' THEN ga.created_at END DESC,
            r.score DESC
          LIMIT 1
        )
      END INTO v_agg;

    IF v_agg IS NULL THEN
      CONTINUE; -- entries without valid attempts simply do not rank
    END IF;

    -- Anchor row supplies audit fields + tie-break metrics.
    SELECT r.accuracy AS accuracy, r.effective_wpm AS wpm,
           COALESCE((r.raw ->> 'incorrectCharacters')::int, 0) AS errors,
           ga.created_at AS submitted_at, ga.id AS attempt_id
    INTO v_rep
    FROM public.competition_attempts ca
    JOIN public.game_attempts ga ON ga.id = ca.attempt_id
    JOIN public.attempt_results r ON r.attempt_id = ga.id
    WHERE ca.entry_id = v_entry.id
      AND ga.status = 'validated' AND r.is_valid
    ORDER BY
      comp_metric_value(
        (r.score)::numeric, (r.accuracy)::numeric, (r.effective_wpm)::numeric,
        v_metric, v_wpm_cap, v_wpm_w, v_acc_w) DESC,
      ga.created_at ASC
    LIMIT 1;

    INSERT INTO comp_work
      (entry_id, user_id, batch_id, value, accuracy, wpm, errors, submitted_at, attempt_id)
    VALUES
      (v_entry.id, v_entry.user_id, v_entry.batch_id, v_agg,
       v_rep.accuracy, v_rep.wpm, v_rep.errors, v_rep.submitted_at, v_rep.attempt_id);
  END LOOP;

  -- Dynamic ORDER BY from the whitelisted tie-break chain (+ entry id total).
  v_order := '';
  FOR v_key IN
    SELECT * FROM unnest(COALESCE(v_comp.tie_breakers,
      ARRAY['score','accuracy','wpm','errors','earliest']))
  LOOP
    v_order := v_order || CASE v_key
      WHEN 'score' THEN 'value DESC, '
      WHEN 'accuracy' THEN 'accuracy DESC, '
      WHEN 'wpm' THEN 'wpm DESC, '
      WHEN 'errors' THEN 'errors ASC, '
      WHEN 'earliest' THEN 'submitted_at ASC, '
      ELSE ''
    END;
  END LOOP;
  v_order := v_order || 'entry_id ASC';

  v_sql := format(
    'INSERT INTO public.competition_results
       (competition_id, scope, ref_id, rank, score, accuracy, wpm, attempts, detail)
     SELECT %L, ''participant'', user_id,
       ROW_NUMBER() OVER (ORDER BY %s),
       value, accuracy, wpm,
       (SELECT count(*) FROM public.competition_attempts WHERE entry_id = w.entry_id),
       jsonb_build_object(''attempt_id'', attempt_id, ''value'', value)
     FROM comp_work w ORDER BY %s RETURNING ref_id',
    p_competition, v_order, v_order);
  -- Count first (RETURNING set consumed by GET DIAGNOSTICS workaround below).
  EXECUTE 'SELECT count(*) FROM comp_work' INTO v_rows;
  EXECUTE v_sql;

  -- Batch aggregates for multi-batch competitions (Phase-3 clan-war
  -- abstraction). A competition spans batches when eligibility lists more
  -- than one batch; type alone is not the discriminator (multi-batch
  -- SCORE_ATTACK competitions aggregate per batch too).
  IF jsonb_array_length(COALESCE(v_comp.eligibility -> 'batches', '[]'::jsonb)) > 1 THEN
    FOR v_b IN
      SELECT DISTINCT batch_id FROM comp_work WHERE batch_id IS NOT NULL
    LOOP
      SELECT comp_batch_aggregate(
        v_comp.aggregate_strategy, v_comp.aggregate_n, v_b.batch_id)
      INTO v_agg;
      INSERT INTO public.competition_results
        (competition_id, scope, ref_id, rank, score, accuracy, wpm, attempts, detail)
      VALUES
        (p_competition, 'batch', v_b.batch_id, 1, COALESCE(v_agg, 0), 0, 0,
         (SELECT count(*) FROM comp_work WHERE batch_id = v_b.batch_id),
         jsonb_build_object('strategy', v_comp.aggregate_strategy));
      v_batches := v_batches + 1;
    END LOOP;
    -- Rank batch rows by score (deterministic: score desc, batch id asc).
    FOR v_ranked IN
      SELECT ref_id, ROW_NUMBER() OVER (ORDER BY score DESC, ref_id ASC) AS rnk
      FROM public.competition_results
      WHERE competition_id = p_competition AND scope = 'batch'
    LOOP
      UPDATE public.competition_results
      SET rank = v_ranked.rnk
      WHERE competition_id = p_competition AND scope = 'batch'
        AND ref_id = v_ranked.ref_id;
    END LOOP;
  END IF;

    -- Rewards through the M5 ledgers (idempotency keys make reruns safe).
    FOR v_ranked IN
    SELECT ref_id, rank FROM public.competition_results
    WHERE competition_id = p_competition AND scope = 'participant'
  LOOP
    v_xp := COALESCE(((v_reward -> 'xp') ->> v_ranked.rank::text)::int,
                     ((v_reward -> 'xp') ->> 'participation')::int, 0);
    v_coins := COALESCE(((v_reward -> 'coins') ->> v_ranked.rank::text)::int,
                        ((v_reward -> 'coins') ->> 'participation')::int, 0);
    v_key := 'competition:' || p_competition::text
      || ':participant:' || v_ranked.ref_id::text || ':reward:v1';
    IF v_xp > 0 THEN
      INSERT INTO public.xp_ledger
        (user_id, amount, source, source_type, reference_id, reason, metadata, balance_after)
      SELECT v_ranked.ref_id, v_xp, 'competition', 'competition', v_key,
             'competition placement',
             jsonb_build_object('competition_id', p_competition, 'rank', v_ranked.rank),
             COALESCE(xp_total, 0) + v_xp
      FROM public.profiles WHERE id = v_ranked.ref_id
      ON CONFLICT (user_id, source, reference_id) DO NOTHING;
      UPDATE public.profiles
      SET xp_total = xp_total + v_xp,
          current_level = (
            SELECT max(level) FROM public.levels
            WHERE required_xp <= xp_total + v_xp)
      WHERE id = v_ranked.ref_id
        AND EXISTS (
          SELECT 1 FROM public.xp_ledger
          WHERE user_id = v_ranked.ref_id AND reference_id = v_key);
      v_rewards := v_rewards + 1;
    END IF;
    IF v_coins > 0 THEN
      INSERT INTO public.coin_ledger
        (user_id, amount, source, source_type, reference_id, reason, metadata, balance_after)
      SELECT v_ranked.ref_id, v_coins, 'competition', 'competition', v_key,
             'competition placement',
             jsonb_build_object('competition_id', p_competition, 'rank', v_ranked.rank),
             COALESCE(coin_balance, 0) + v_coins
      FROM public.profiles WHERE id = v_ranked.ref_id
      ON CONFLICT (user_id, source, reference_id) DO NOTHING;
      UPDATE public.profiles SET coin_balance = coin_balance + v_coins
      WHERE id = v_ranked.ref_id
        AND EXISTS (
          SELECT 1 FROM public.coin_ledger
          WHERE user_id = v_ranked.ref_id AND reference_id = v_key);
    END IF;
    INSERT INTO public.competition_reward_events (key, competition_id, user_id)
    VALUES (v_key, p_competition, v_ranked.ref_id)
    ON CONFLICT (key) DO NOTHING;
    IF v_ranked.rank = 1 AND v_reward ? 'badge_first' THEN
      INSERT INTO public.badge_awards (user_id, badge_id)
      VALUES (v_ranked.ref_id, v_reward ->> 'badge_first')
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.competitions SET status = 'finalized' WHERE id = p_competition;
  INSERT INTO public.competition_state_events
    (competition_id, actor_user_id, from_status, to_status)
  VALUES (p_competition, v_me, 'processing', 'finalized');

  RETURN jsonb_build_object(
    'participants', v_rows, 'batches', v_batches, 'rewards', v_rewards);
END;
$$;

-- Metric value helper (mirrors TS competitionValue).
CREATE OR REPLACE FUNCTION public.comp_metric_value(
  p_score numeric, p_acc numeric, p_wpm numeric,
  p_metric text, p_wpm_cap numeric, p_wpm_w numeric, p_acc_w numeric
)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_metric
    WHEN 'wpm' THEN p_wpm
    WHEN 'accuracy' THEN p_acc
    WHEN 'score' THEN p_score
    ELSE LEAST(p_wpm / NULLIF(p_wpm_cap, 0), 1) * p_wpm_w
       + LEAST(GREATEST(p_acc, 0) / 100, 1) * p_acc_w
  END;
$$;

-- Batch aggregate helper (mirrors TS aggregateBatch).
CREATE OR REPLACE FUNCTION public.comp_batch_aggregate(
  p_strategy text, p_n int, p_batch uuid
)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := GREATEST(COALESCE(p_n, 3), 1);
  v_out numeric;
BEGIN
  SELECT CASE COALESCE(p_strategy, 'SUM')
    WHEN 'SUM' THEN sum(value)
    WHEN 'AVERAGE' THEN avg(value)
    WHEN 'TOP_N' THEN (
      SELECT sum(x.v) FROM (SELECT value AS v FROM comp_work
        WHERE batch_id = p_batch ORDER BY value DESC LIMIT v_n) x)
    WHEN 'AVERAGE_TOP_N' THEN (
      SELECT avg(x.v) FROM (SELECT value AS v FROM comp_work
        WHERE batch_id = p_batch ORDER BY value DESC LIMIT v_n) x)
    WHEN 'BEST_PLAYER' THEN max(value)
    WHEN 'PARTICIPATION_WEIGHTED' THEN
      avg(value) * log(10 + count(*))
    ELSE sum(value)
  END INTO v_out
  FROM comp_work WHERE batch_id = p_batch;
  RETURN COALESCE(v_out, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Audited corrections on finalized results (originals preserved in audit).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_adjustment(
  p_competition uuid,
  p_scope text,
  p_ref uuid,
  p_patch jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_old jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.fn_can_manage_competition(p_competition) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.competitions
    WHERE id = p_competition AND status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF p_scope NOT IN ('participant', 'batch') THEN
    RAISE EXCEPTION 'INVALID_SCOPE';
  END IF;
  SELECT to_jsonb(r) INTO v_old FROM public.competition_results r
  WHERE r.competition_id = p_competition AND r.scope = p_scope AND r.ref_id = p_ref;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  UPDATE public.competition_results SET
    score = COALESCE((p_patch ->> 'score')::numeric, score),
    accuracy = COALESCE((p_patch ->> 'accuracy')::numeric, accuracy),
    wpm = COALESCE((p_patch ->> 'wpm')::numeric, wpm),
    detail = detail || jsonb_build_object('adjusted', true)
  WHERE competition_id = p_competition AND scope = p_scope AND ref_id = p_ref;

  INSERT INTO public.competition_adjustments
    (competition_id, scope, ref_id, old_values, new_values, reason, actor_user_id)
  VALUES (
    p_competition, p_scope, p_ref, v_old,
    (SELECT to_jsonb(r) FROM public.competition_results r
     WHERE r.competition_id = p_competition AND r.scope = p_scope AND r.ref_id = p_ref),
    p_reason, v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_competition(text, text, text, public.competition_type, text, uuid[], uuid[], text[], int, numeric, numeric, text[], jsonb, jsonb, text[], text, int, text, int, jsonb, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_competition(text, text, text, public.competition_type, text, uuid[], uuid[], text[], int, numeric, numeric, text[], jsonb, jsonb, text[], text, int, text, int, jsonb, timestamptz, timestamptz, timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_update_competition_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_competition_draft(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_transition_competition(uuid, public.competition_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transition_competition(uuid, public.competition_status) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_register_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_entry(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_attach_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_attach_attempt(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_finalize_competition(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_competition(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_record_adjustment(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_adjustment(uuid, text, uuid, jsonb, text) TO authenticated;
