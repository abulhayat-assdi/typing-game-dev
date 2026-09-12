-- M5 0009: fn_process_progression — the atomic progression pipeline.
--
-- VALIDATED attempt → XP + coins → level → streak → badges → achievements →
-- records → unlocks, committed atomically. Consumes ONLY validated results
-- (M4 pipeline output); anything else raises NOT_VALIDATED.
--
-- Idempotency: reward_events key 'attempt:{id}:progression:v1' is inserted
-- first; concurrent or repeated processing returns {already_processed:true}
-- with zero additional grants (UNIQUE key + row locks on profiles/attempt).

-- Recursive unlock-rule evaluator (missionsCompleted is not evaluable in M5
-- — no mission tables exist — so such rules stay locked, conservatively).
CREATE OR REPLACE FUNCTION public.fn_check_unlock(
  p_rule jsonb,
  p_level int,
  p_xp int,
  p_acc numeric,
  p_wpm numeric,
  p_games text[],
  p_badges text[]
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := p_rule ->> 'type';
  v_op text := p_rule ->> 'op';
  v_sub jsonb;
  v_slug text;
BEGIN
  IF v_op IN ('and', 'or') THEN
    FOR v_sub IN SELECT * FROM jsonb_array_elements(p_rule -> 'rules') LOOP
      IF v_op = 'and' AND NOT public.fn_check_unlock(
        v_sub, p_level, p_xp, p_acc, p_wpm, p_games, p_badges) THEN
        RETURN false;
      END IF;
      IF v_op = 'or' AND public.fn_check_unlock(
        v_sub, p_level, p_xp, p_acc, p_wpm, p_games, p_badges) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN v_op = 'and';
  END IF;

  CASE v_kind
    WHEN 'open' THEN RETURN true;
    WHEN 'level' THEN RETURN p_level >= (p_rule ->> 'min')::int;
    WHEN 'xp' THEN RETURN p_xp >= (p_rule ->> 'min')::int;
    WHEN 'accuracy' THEN RETURN p_acc >= (p_rule ->> 'min')::numeric;
    WHEN 'wpm' THEN RETURN p_wpm >= (p_rule ->> 'min')::numeric;
    WHEN 'missionsCompleted' THEN RETURN false; -- no mission tables in M5
    WHEN 'gamesCompleted' THEN
      FOR v_slug IN SELECT * FROM jsonb_array_elements_text(p_rule -> 'gameSlugs') LOOP
        IF NOT (v_slug = ANY (p_games)) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'badge' THEN RETURN (p_rule ->> 'badgeSlug') = ANY (p_badges);
    ELSE RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION
  public.fn_check_unlock(jsonb, int, int, numeric, numeric, text[], text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_check_unlock(jsonb, int, int, numeric, numeric, text[], text[])
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Main pipeline.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_process_progression(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prof public.profiles%ROWTYPE;
  v_attempt public.game_attempts%ROWTYPE;
  v_result public.attempt_results%ROWTYPE;
  v_profile public.reward_profiles%ROWTYPE;
  v_key text;
  v_is_first boolean;
  v_old_best numeric;
  v_is_pb boolean;
  v_xp int;
  v_coins int;
  v_new_total int;
  v_new_coins int;
  v_level int;
  v_old_level int;
  v_tz text;
  v_event_date date;
  v_streak_cur int := 0;
  v_streak_best int := 0;
  v_streak public.streaks%ROWTYPE;
  v_has_streak boolean;
  v_new_badges jsonb := '[]'::jsonb;
  v_new_ach text[] := '{}';
  v_records text[] := '{}';
  v_unlocked text[] := '{}';
  v_chars numeric; v_words numeric; v_attempts numeric;
  v_games_done numeric; v_zero_runs numeric;
  v_best_wpm numeric; v_best_acc numeric;
  v_games text[]; v_badges text[];
  v_badge record; v_ach record; v_game record; v_s text;
  v_cand numeric; v_has boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Lock order (profiles → attempt) is fixed to avoid deadlocks.
  SELECT * INTO v_prof FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;
  SELECT * INTO v_attempt FROM public.game_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.user_id <> v_user_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;
  IF v_attempt.status <> 'validated' THEN
    RAISE EXCEPTION 'NOT_VALIDATED';
  END IF;
  SELECT * INTO v_result FROM public.attempt_results WHERE attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESULT_MISSING';
  END IF;

  -- Idempotency anchor: second processing of the same attempt is a no-op.
  v_key := 'attempt:' || p_attempt_id::text || ':progression:v1';
  INSERT INTO public.reward_events (key, user_id, attempt_id)
  VALUES (v_key, v_user_id, p_attempt_id)
  ON CONFLICT (key) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('already_processed', true);
  END IF;

  SELECT * INTO v_profile FROM public.reward_profiles WHERE id = 'default';

  SELECT NOT EXISTS (
    SELECT 1 FROM public.attempt_results r
    JOIN public.game_attempts a ON a.id = r.attempt_id
    WHERE a.user_id = v_user_id AND a.game_id = v_attempt.game_id
      AND a.id <> p_attempt_id AND r.is_valid
  ) INTO v_is_first;

  SELECT max(r.score) INTO v_old_best
  FROM public.attempt_results r
  JOIN public.game_attempts a ON a.id = r.attempt_id
  WHERE a.user_id = v_user_id AND a.game_id = v_attempt.game_id
    AND a.id <> p_attempt_id AND r.is_valid;
  v_is_pb := v_old_best IS NULL OR v_result.score > v_old_best;

  -- -- XP + coins (mirrors @tap/economy award math) -------------------------
  v_xp := v_profile.xp_completion
    + CASE WHEN v_is_first THEN v_profile.xp_first_completion ELSE 0 END
    + CASE WHEN v_is_pb THEN v_profile.xp_personal_best ELSE 0 END
    + CASE WHEN v_result.accuracy >= v_profile.accuracy_milestone_threshold
           THEN v_profile.xp_accuracy_milestone ELSE 0 END
    + CASE WHEN v_result.effective_wpm >= v_profile.speed_milestone_wpm
           THEN v_profile.xp_speed_milestone ELSE 0 END;
  v_coins := v_profile.coin_completion
    + CASE WHEN v_is_pb THEN v_profile.coin_personal_best ELSE 0 END;

  v_new_total := v_prof.xp_total + v_xp;
  v_new_coins := v_prof.coin_balance + v_coins;

  INSERT INTO public.xp_ledger
    (user_id, amount, source, source_type, reference_id, reason, metadata, balance_after)
  VALUES
    (v_user_id, v_xp, 'attempt', 'attempt', v_key, 'validated completion',
     jsonb_build_object('attempt_id', p_attempt_id, 'game_id', v_attempt.game_id,
                        'first', v_is_first, 'personal_best', v_is_pb),
     v_new_total);

  IF v_coins <> 0 THEN
    INSERT INTO public.coin_ledger
      (user_id, amount, source, source_type, reference_id, reason, metadata, balance_after)
    VALUES
      (v_user_id, v_coins, 'attempt', 'attempt', v_key, 'validated completion',
       jsonb_build_object('attempt_id', p_attempt_id, 'personal_best', v_is_pb),
       v_new_coins);
  END IF;

  SELECT max(level) INTO v_level FROM public.levels WHERE required_xp <= v_new_total;
  v_old_level := v_prof.current_level;

  UPDATE public.profiles
  SET xp_total = v_new_total, coin_balance = v_new_coins, current_level = v_level
  WHERE id = v_user_id;

  -- -- Streak (event date in the student's timezone) -------------------------
  v_tz := v_prof.timezone;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;
  v_event_date := (v_attempt.finalized_at AT TIME ZONE v_tz)::date;

  SELECT * INTO v_streak FROM public.streaks WHERE user_id = v_user_id FOR UPDATE;
  v_has_streak := FOUND;
  IF NOT v_has_streak THEN
    INSERT INTO public.streaks
      (user_id, current_count, best_count, last_active_date, timezone, active_days)
    VALUES (v_user_id, 1, 1, v_event_date, v_tz, 1);
  ELSIF v_streak.last_active_date = v_event_date THEN
    UPDATE public.streaks SET timezone = v_tz, updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_streak.last_active_date = v_event_date - 1 THEN
    UPDATE public.streaks
    SET current_count = current_count + 1,
        best_count = GREATEST(best_count, current_count + 1),
        last_active_date = v_event_date, timezone = v_tz, updated_at = now()
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.streaks
    SET current_count = 1,
        last_active_date = GREATEST(last_active_date, v_event_date),
        timezone = v_tz, updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  INSERT INTO public.streak_events (user_id, activity_date, attempt_id)
  VALUES (v_user_id, v_event_date, p_attempt_id)
  ON CONFLICT (user_id, activity_date) DO NOTHING;
  UPDATE public.streaks SET active_days = (
    SELECT count(*) FROM public.streak_events WHERE user_id = v_user_id
  ) WHERE user_id = v_user_id;
  SELECT current_count, best_count INTO v_streak_cur, v_streak_best
  FROM public.streaks WHERE user_id = v_user_id;

  -- -- Lifetime stats (current attempt included — its result is committed) ---
  SELECT
    COALESCE(sum((r.raw ->> 'totalCharacters')::numeric), 0),
    COALESCE(sum((r.raw ->> 'completedWords')::numeric), 0),
    count(*),
    count(DISTINCT a.game_id),
    count(*) FILTER (WHERE (r.raw ->> 'incorrectCharacters')::int = 0),
    COALESCE(max(r.effective_wpm), 0),
    COALESCE(max(r.accuracy), 0)
  INTO v_chars, v_words, v_attempts, v_games_done, v_zero_runs,
       v_best_wpm, v_best_acc
  FROM public.attempt_results r
  JOIN public.game_attempts a ON a.id = r.attempt_id
  WHERE a.user_id = v_user_id AND r.is_valid;

  -- -- Badges ----------------------------------------------------------------
  FOR v_badge IN SELECT * FROM public.badges WHERE is_active LOOP
    v_has := CASE v_badge.criteria ->> 'kind'
      WHEN 'first_completion' THEN v_is_first
      WHEN 'accuracy_min' THEN v_result.accuracy >= (v_badge.criteria ->> 'min')::numeric
      WHEN 'wpm_min' THEN v_result.effective_wpm >= (v_badge.criteria ->> 'min')::numeric
      WHEN 'streak_days' THEN (
        SELECT best_count FROM public.streaks WHERE user_id = v_user_id
      ) >= (v_badge.criteria ->> 'min')::numeric
      WHEN 'words_total' THEN v_words >= (v_badge.criteria ->> 'min')::numeric
      WHEN 'games_completed' THEN v_games_done >= (v_badge.criteria ->> 'min')::numeric
      WHEN 'zero_error_runs' THEN v_zero_runs >= (v_badge.criteria ->> 'min')::numeric
      ELSE false
    END;
    IF v_has THEN
      INSERT INTO public.badge_awards (user_id, badge_id, attempt_id)
      VALUES (v_user_id, v_badge.id, p_attempt_id)
      ON CONFLICT (user_id, badge_id) DO NOTHING
      RETURNING badge_id INTO v_s;
      IF FOUND THEN
        v_new_badges := v_new_badges || jsonb_build_array(
          jsonb_build_object('slug', v_s, 'name', v_badge.name_en));
      END IF;
    END IF;
  END LOOP;

  -- -- Achievements ------------------------------------------------------------
  FOR v_ach IN SELECT * FROM public.achievements WHERE is_active LOOP
    v_cand := CASE v_ach.metric
      WHEN 'total_chars' THEN v_chars
      WHEN 'total_words' THEN v_words
      WHEN 'attempts' THEN v_attempts
      WHEN 'best_wpm' THEN v_best_wpm
      WHEN 'best_accuracy' THEN v_best_acc
      WHEN 'streak_best' THEN (
        SELECT best_count::numeric FROM public.streaks WHERE user_id = v_user_id
      )
      ELSE -1
    END;
    IF v_cand >= v_ach.threshold THEN
      INSERT INTO public.achievement_awards (user_id, achievement_id, value)
      VALUES (v_user_id, v_ach.id, v_cand)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING achievement_id INTO v_s;
      IF FOUND THEN
        v_new_ach := v_new_ach || ARRAY[v_s];
      END IF;
    END IF;
  END LOOP;

  -- -- Personal records (strictly better wins; ties keep the older attempt) ---
  -- best_score
  INSERT INTO public.personal_records (user_id, game_id, metric, value, attempt_id)
  VALUES (v_user_id, v_attempt.game_id, 'best_score', v_result.score, p_attempt_id)
  ON CONFLICT (user_id, game_id, metric) DO UPDATE
    SET value = EXCLUDED.value, attempt_id = EXCLUDED.attempt_id,
        recorded_at = now()
    WHERE EXCLUDED.value > public.personal_records.value
  RETURNING metric INTO v_s;
  IF FOUND THEN v_records := v_records || ARRAY['best_score:' || v_result.score::text]; END IF;
  -- best_wpm
  INSERT INTO public.personal_records (user_id, game_id, metric, value, attempt_id)
  VALUES (v_user_id, v_attempt.game_id, 'best_wpm', v_result.effective_wpm, p_attempt_id)
  ON CONFLICT (user_id, game_id, metric) DO UPDATE
    SET value = EXCLUDED.value, attempt_id = EXCLUDED.attempt_id,
        recorded_at = now()
    WHERE EXCLUDED.value > public.personal_records.value
  RETURNING metric INTO v_s;
  IF FOUND THEN v_records := v_records || ARRAY['best_wpm:' || v_result.effective_wpm::text]; END IF;
  -- best_accuracy
  INSERT INTO public.personal_records (user_id, game_id, metric, value, attempt_id)
  VALUES (v_user_id, v_attempt.game_id, 'best_accuracy', v_result.accuracy, p_attempt_id)
  ON CONFLICT (user_id, game_id, metric) DO UPDATE
    SET value = EXCLUDED.value, attempt_id = EXCLUDED.attempt_id,
        recorded_at = now()
    WHERE EXCLUDED.value > public.personal_records.value
  RETURNING metric INTO v_s;
  IF FOUND THEN v_records := v_records || ARRAY['best_accuracy:' || v_result.accuracy::text]; END IF;
  -- fastest_ms (full completions only)
  IF (v_result.raw ->> 'completion')::numeric >= 100 THEN
    INSERT INTO public.personal_records (user_id, game_id, metric, value, attempt_id)
    VALUES (v_user_id, v_attempt.game_id, 'fastest_ms',
            (v_result.raw ->> 'durationMs')::numeric, p_attempt_id)
    ON CONFLICT (user_id, game_id, metric) DO UPDATE
      SET value = EXCLUDED.value, attempt_id = EXCLUDED.attempt_id,
          recorded_at = now()
      WHERE EXCLUDED.value < public.personal_records.value
        AND EXCLUDED.value > 0
    RETURNING metric INTO v_s;
    IF FOUND THEN v_records := v_records || ARRAY['fastest_ms']; END IF;
  END IF;
  -- most_chars
  INSERT INTO public.personal_records (user_id, game_id, metric, value, attempt_id)
  VALUES (v_user_id, v_attempt.game_id, 'most_chars',
          (v_result.raw ->> 'totalCharacters')::numeric, p_attempt_id)
  ON CONFLICT (user_id, game_id, metric) DO UPDATE
    SET value = EXCLUDED.value, attempt_id = EXCLUDED.attempt_id,
        recorded_at = now()
    WHERE EXCLUDED.value > public.personal_records.value
  RETURNING metric INTO v_s;
  IF FOUND THEN v_records := v_records || ARRAY['most_chars']; END IF;

  -- -- Unlocks (conservative: missionsCompleted rules stay locked in M5) -------
  SELECT COALESCE(array_agg(DISTINCT g.slug), '{}')
  INTO v_games
  FROM public.attempt_results r
  JOIN public.game_attempts a ON a.id = r.attempt_id
  JOIN public.games g ON g.id = a.game_id
  WHERE a.user_id = v_user_id AND r.is_valid;

  SELECT COALESCE(array_agg(badge_id), '{}')
  INTO v_badges
  FROM public.badge_awards WHERE user_id = v_user_id;

  FOR v_game IN SELECT slug, unlock_rule FROM public.games WHERE is_active LOOP
    IF public.fn_check_unlock(
      v_game.unlock_rule, v_level, v_new_total,
      v_best_acc, v_best_wpm, v_games, v_badges) THEN
      INSERT INTO public.game_unlocks (user_id, game_slug, unlocked, reason)
      VALUES (v_user_id, v_game.slug, true,
              jsonb_build_object('attempt_id', p_attempt_id))
      ON CONFLICT (user_id, game_slug) DO NOTHING
      RETURNING game_slug INTO v_s;
      IF FOUND THEN
        v_unlocked := v_unlocked || ARRAY[v_s];
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'already_processed', false,
    'xp', v_xp,
    'coins', v_coins,
    'level', v_level,
    'xp_total', v_new_total,
    'leveled_up', v_level > v_old_level,
    'streak_current', v_streak_cur,
    'streak_best', v_streak_best,
    'new_badges', v_new_badges,
    'new_achievements', v_new_ach,
    'records', v_records,
    'unlocked', v_unlocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_process_progression(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_process_progression(uuid) TO authenticated;
