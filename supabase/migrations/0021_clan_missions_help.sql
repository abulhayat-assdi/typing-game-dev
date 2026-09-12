-- M10 clan missions + bounded help. Member activity in, M5 ledgers out.
-- Students can never write clan state directly (no policies for writes).

-- Help economy constants (server-enforced; see docs/clan-help.md).
--   REQ_MAX ............ max XP per request ............ 50
--   TTL ................ default 48h, clamp 1..72h
--   SUPPORTER_DAILY .... max coins spent per day ...... 100
--   REQUESTER_DAILY .... max XP received per day ...... 50
--   One open request per requester at a time.

CREATE OR REPLACE FUNCTION public.fn_link_clan_mission(
  p_mission uuid, p_clan uuid, p_period_start date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.fn_can_manage_clan(p_clan) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missions
                 WHERE id = p_mission AND status = 'active'
                   AND category = 'CLAN') THEN
    RAISE EXCEPTION 'NOT_CLAN_MISSION';
  END IF;
  INSERT INTO public.clan_missions (mission_id, clan_id, period_start)
  VALUES (p_mission, p_clan, p_period_start)
  ON CONFLICT (mission_id, clan_id, period_start) DO NOTHING
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    SELECT id INTO v_id FROM public.clan_missions
    WHERE mission_id = p_mission AND clan_id = p_clan
      AND period_start = p_period_start;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_start_clan_mission(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clan uuid;
  v_status public.mission_instance_status;
BEGIN
  SELECT clan_id, status INTO v_clan, v_status
  FROM public.clan_missions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT public.fn_is_clan_staff(v_clan, auth.uid())
    AND NOT public.fn_can_manage_clan(v_clan) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_status <> 'available' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  UPDATE public.clan_missions
  SET status = 'active', started_at = now() WHERE id = p_id;
  PERFORM public.fn_log_clan(v_clan, 'mission_started', auth.uid(),
    jsonb_build_object('clan_mission_id', p_id));
END;
$$;

-- Aggregate evaluator over active clan members' validated attempts.
-- Same objective kinds as M9, clan semantics: counts/sums/averages over
-- the member set; WPM counts qualifying members; accuracy averages.
CREATE OR REPLACE FUNCTION public.fn_sync_clan_mission(p_id uuid)
RETURNS public.mission_instance_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cm record;
  v_m record;
  v_from timestamptz;
  v_to timestamptz;
  v_games text[] := '{}';
  v_worlds text[] := '{}';
  v_obj record;
  v_n int := 0;
  v_done int := 0;
  v_prog jsonb := '{"objectives": []}'::jsonb;
  v_cur numeric;
  v_need numeric;
  v_ok boolean;
  v_parts uuid[];
  v_all_parts uuid[] := '{}';
  v_xp int;
  v_coins int;
  v_key text;
  v_uid uuid;
BEGIN
  SELECT * INTO v_cm FROM public.clan_missions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_cm.status <> 'active' THEN
    RETURN v_cm.status;
  END IF;
  SELECT * INTO v_m FROM public.missions WHERE id = v_cm.mission_id;
  v_from := (v_cm.period_start::text || ' 00:00')::timestamp AT TIME ZONE 'UTC';
  IF v_m.category = 'WEEKLY' THEN
    v_to := v_from + interval '7 days';
  ELSIF v_m.category = 'DAILY' THEN
    v_to := v_from + interval '1 day';
  ELSE
    v_to := COALESCE(v_m.ends_at, v_from + interval '30 days');
    v_from := COALESCE(v_m.starts_at, v_from);
  END IF;
  SELECT COALESCE(array_agg(x), '{}') INTO v_games
  FROM jsonb_array_elements_text(
    COALESCE(v_m.game_constraints -> 'games', '[]'::jsonb)) AS x;
  SELECT COALESCE(array_agg(x), '{}') INTO v_worlds
  FROM jsonb_array_elements_text(
    COALESCE(v_m.game_constraints -> 'worlds', '[]'::jsonb)) AS x;

  FOR v_obj IN
    SELECT position, kind, target FROM public.mission_objectives
    WHERE mission_id = v_cm.mission_id ORDER BY position
  LOOP
    v_n := v_n + 1;
    WITH base AS (
      SELECT a.user_id, a.game_id,
             r.score, r.accuracy, r.effective_wpm,
             (r.raw ->> 'correctCharacters')::int AS chars,
             (r.raw ->> 'completedWords')::int AS words,
             (r.raw ->> 'incorrectCharacters')::int AS errors,
             g.world_id
      FROM public.game_attempts a
      JOIN public.attempt_results r ON r.attempt_id = a.id
      JOIN public.games g ON g.id = a.game_id
      JOIN public.clan_members m ON m.user_id = a.user_id
      WHERE m.clan_id = v_cm.clan_id AND m.status = 'active'
        AND a.status = 'validated' AND r.is_valid
        AND a.submitted_at >= v_from AND a.submitted_at < v_to
        AND (v_games = '{}' OR g.slug = ANY (v_games))
        AND (v_worlds = '{}' OR g.world_id = ANY (v_worlds))
    ), agg AS (
      SELECT
        count(*)::numeric AS n,
        COALESCE(sum(score), 0) AS sum_score,
        COALESCE(max(score), 0) AS max_score,
        COALESCE(avg(accuracy), 0) AS avg_acc,
        COALESCE(sum(chars), 0) AS sum_chars,
        COALESCE(sum(words), 0) AS sum_words,
        (SELECT count(*)::numeric FROM base WHERE errors = 0) AS perfect,
        (SELECT count(DISTINCT game_id)::numeric FROM base) AS games,
        (SELECT count(DISTINCT user_id)::numeric FROM base
         WHERE effective_wpm >= COALESCE((v_obj.target ->> 'threshold')::numeric, 0)) AS wpm_members,
        (SELECT count(*)::numeric FROM public.personal_records pr
         JOIN public.clan_members m2 ON m2.user_id = pr.user_id
         WHERE m2.clan_id = v_cm.clan_id AND m2.status = 'active'
           AND pr.recorded_at >= v_from AND pr.recorded_at < v_to) AS pbs
      FROM base
    )
    SELECT
      CASE v_obj.kind
        WHEN 'GAMES_COMPLETED' THEN n
        WHEN 'CHARS_TYPED' THEN sum_chars
        WHEN 'WORDS_TYPED' THEN sum_words
        WHEN 'DISTINCT_GAMES' THEN games
        WHEN 'WORLD_GAMES' THEN n
        WHEN 'SCORE_REACHED' THEN
          CASE WHEN COALESCE(v_obj.target ->> 'mode', 'sum') = 'max'
            THEN max_score ELSE sum_score END
        WHEN 'ACCURACY_REACHED' THEN avg_acc
        WHEN 'WPM_REACHED' THEN wpm_members
        WHEN 'PERFECT_RUN' THEN perfect
        WHEN 'PERSONAL_BEST' THEN pbs
        ELSE 0 END,
      CASE WHEN v_obj.kind = 'PERSONAL_BEST' THEN '{}'::uuid[]
        ELSE COALESCE((SELECT array_agg(DISTINCT user_id) FROM base), '{}') END
    INTO v_cur, v_parts FROM agg;
    v_cur := COALESCE(v_cur, 0);
    v_need := COALESCE(
      CASE WHEN v_obj.kind IN ('ACCURACY_REACHED', 'WPM_REACHED', 'SCORE_REACHED')
        THEN (v_obj.target ->> 'threshold')::numeric
        ELSE (v_obj.target ->> 'count')::numeric END, 1);
    -- WPM clan semantics: threshold + member count (default 1).
    IF v_obj.kind = 'WPM_REACHED' AND (v_obj.target ->> 'count')::int IS NOT NULL THEN
      v_need := (v_obj.target ->> 'count')::numeric;
      SELECT count(*)::numeric INTO v_cur
      FROM (SELECT a.user_id FROM public.game_attempts a
            JOIN public.attempt_results r ON r.attempt_id = a.id
            JOIN public.games g ON g.id = a.game_id
            JOIN public.clan_members m ON m.user_id = a.user_id
            WHERE m.clan_id = v_cm.clan_id AND m.status = 'active'
              AND a.status = 'validated' AND r.is_valid
              AND a.submitted_at >= v_from AND a.submitted_at < v_to
              AND (v_games = '{}' OR g.slug = ANY (v_games))
              AND (v_worlds = '{}' OR g.world_id = ANY (v_worlds))
            GROUP BY a.user_id
            HAVING max(r.effective_wpm) >= (v_obj.target ->> 'threshold')::numeric) q;
      v_cur := COALESCE(v_cur, 0);
    END IF;
    v_ok := v_cur >= v_need;
    IF v_ok THEN
      v_done := v_done + 1;
    END IF;
    v_all_parts := array_cat(v_all_parts, COALESCE(v_parts, '{}'));
    v_prog := jsonb_set(v_prog, '{objectives}',
      COALESCE(v_prog -> 'objectives', '[]'::jsonb) || jsonb_build_object(
        'position', v_obj.position, 'kind', v_obj.kind,
        'current', v_cur, 'target', v_need, 'completed', v_ok,
        'participants', COALESCE(array_length(v_parts, 1), 0)));
  END LOOP;

  IF v_n = 0 THEN
    -- Legacy single-condition missions (no explicit objective rows).
    v_n := 1;
    WITH base AS (
      SELECT a.user_id,
             r.score, r.accuracy, r.effective_wpm,
             (r.raw ->> 'correctCharacters')::int AS chars,
             (r.raw ->> 'completedWords')::int AS words,
             (r.raw ->> 'incorrectCharacters')::int AS errors,
             g.world_id, a.game_id
      FROM public.game_attempts a
      JOIN public.attempt_results r ON r.attempt_id = a.id
      JOIN public.games g ON g.id = a.game_id
      JOIN public.clan_members m ON m.user_id = a.user_id
      WHERE m.clan_id = v_cm.clan_id AND m.status = 'active'
        AND a.status = 'validated' AND r.is_valid
        AND a.submitted_at >= v_from AND a.submitted_at < v_to
        AND (v_games = '{}' OR g.slug = ANY (v_games))
        AND (v_worlds = '{}' OR g.world_id = ANY (v_worlds))
    )
    SELECT count(*)::numeric,
           COALESCE((SELECT array_agg(DISTINCT user_id) FROM base), '{}')
    INTO v_cur, v_parts FROM base;
    v_cur := COALESCE(v_cur, 0);
    v_need := COALESCE((v_m.target ->> 'count')::numeric, 1);
    v_ok := v_cur >= v_need;
    IF v_ok THEN
      v_done := 1;
    END IF;
    v_all_parts := array_cat(v_all_parts, COALESCE(v_parts, '{}'));
    v_prog := jsonb_set(v_prog, '{objectives}',
      jsonb_build_array(jsonb_build_object(
        'position', 0, 'kind', v_m.objective_type,
        'current', v_cur, 'target', v_need, 'completed', v_ok,
        'participants', COALESCE(array_length(v_parts, 1), 0))));
  END IF;
  IF v_done = v_n THEN
    UPDATE public.clan_missions
    SET progress = v_prog, status = 'completed', completed_at = now()
    WHERE id = p_id AND status = 'active';
    v_key := 'clan-mission:' || p_id::text || ':completion:v1';
    INSERT INTO public.clan_mission_completion_events (key, clan_mission_id, clan_id)
    VALUES (v_key, p_id, v_cm.clan_id)
    ON CONFLICT (key) DO NOTHING;
    IF FOUND THEN
      v_xp := COALESCE((v_m.reward_profile ->> 'xp')::int, 0);
      v_coins := COALESCE((v_m.reward_profile ->> 'coins')::int, 0);
      SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_all_parts
      FROM unnest(v_all_parts) AS u;
      FOREACH v_uid IN ARRAY v_all_parts LOOP
        -- Personal rewards per contributor, idempotent per member.
        INSERT INTO public.reward_events (key, user_id, attempt_id)
        VALUES (v_key || ':member:' || v_uid::text, v_uid, NULL)
        ON CONFLICT (key) DO NOTHING;
        IF FOUND THEN
          IF v_xp > 0 THEN
            INSERT INTO public.xp_ledger
              (user_id, amount, source, source_type, reference_id, reason,
               metadata, balance_after)
            SELECT v_uid, v_xp, 'clan_mission', 'clan_mission',
                   v_key || ':member:' || v_uid::text, 'clan mission completion',
                   jsonb_build_object('clan_mission_id', p_id), COALESCE(xp_total, 0) + v_xp
            FROM public.profiles WHERE id = v_uid
            ON CONFLICT (user_id, source, reference_id) DO NOTHING;
            UPDATE public.profiles SET xp_total = xp_total + v_xp,
              current_level = (SELECT max(level) FROM public.levels
                               WHERE required_xp <= xp_total + v_xp)
            WHERE id = v_uid AND EXISTS (
              SELECT 1 FROM public.xp_ledger
              WHERE user_id = v_uid
                AND reference_id = v_key || ':member:' || v_uid::text);
          END IF;
          IF v_coins > 0 THEN
            INSERT INTO public.coin_ledger
              (user_id, amount, source, source_type, reference_id, reason,
               metadata, balance_after)
            SELECT v_uid, v_coins, 'clan_mission', 'clan_mission',
                   v_key || ':member:' || v_uid::text, 'clan mission completion',
                   jsonb_build_object('clan_mission_id', p_id), COALESCE(coin_balance, 0) + v_coins
            FROM public.profiles WHERE id = v_uid
            ON CONFLICT (user_id, source, reference_id) DO NOTHING;
            UPDATE public.profiles SET coin_balance = coin_balance + v_coins
            WHERE id = v_uid AND EXISTS (
              SELECT 1 FROM public.coin_ledger
              WHERE user_id = v_uid
                AND reference_id = v_key || ':member:' || v_uid::text);
          END IF;
        END IF;
      END LOOP;
      PERFORM public.fn_log_clan(v_cm.clan_id, 'mission_completed', NULL,
        jsonb_build_object('clan_mission_id', p_id,
          'contributors', COALESCE(array_length(v_all_parts, 1), 0)));
    END IF;
    RETURN 'completed'::public.mission_instance_status;
  END IF;
  UPDATE public.clan_missions SET progress = v_prog WHERE id = p_id;
  RETURN 'active'::public.mission_instance_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- Bounded help: coin cost from supporter, capped system XP to requester.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_expire_help_requests()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
  r record;
BEGIN
  FOR r IN SELECT id, clan_id FROM public.clan_help_requests
           WHERE status IN ('open', 'partially_fulfilled') AND expires_at <= now()
  LOOP
    UPDATE public.clan_help_requests SET status = 'expired' WHERE id = r.id;
    PERFORM public.fn_log_clan(r.clan_id, 'help_expired', NULL,
      jsonb_build_object('request_id', r.id));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_help_request(
  p_clan uuid, p_context jsonb, p_requested int, p_ttl_hours int DEFAULT 48
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
  v_ttl int;
BEGIN
  PERFORM public.fn_expire_help_requests();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members
                 WHERE clan_id = p_clan AND user_id = v_me
                   AND status = 'active') THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_requested IS NULL OR p_requested <= 0 OR p_requested > 50 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_help_requests
             WHERE clan_id = p_clan AND requester_user_id = v_me
               AND status IN ('open', 'partially_fulfilled')) THEN
    RAISE EXCEPTION 'ALREADY_OPEN';
  END IF;
  v_ttl := GREATEST(1, LEAST(COALESCE(p_ttl_hours, 48), 72));
  INSERT INTO public.clan_help_requests
    (clan_id, requester_user_id, context, requested, expires_at)
  VALUES (p_clan, v_me, COALESCE(p_context, '{}'::jsonb), p_requested,
          now() + (v_ttl || ' hours')::interval)
  RETURNING id INTO v_id;
  PERFORM public.fn_log_clan(p_clan, 'help_requested', v_me,
    jsonb_build_object('request_id', v_id, 'requested', p_requested));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_contribute_help(
  p_request uuid, p_amount int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_req record;
  v_day date := CURRENT_DATE;
  v_spent int;
  v_received int;
  v_new int;
  v_debit_key text;
  v_credit_key text;
BEGIN
  PERFORM public.fn_expire_help_requests();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_req FROM public.clan_help_requests WHERE id = p_request
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_req.status NOT IN ('open', 'partially_fulfilled')
     OR v_req.expires_at <= now() THEN
    RAISE EXCEPTION 'CLOSED';
  END IF;
  IF v_me = v_req.requester_user_id THEN
    RAISE EXCEPTION 'SELF_FULFILL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members
                 WHERE clan_id = v_req.clan_id AND user_id = v_me
                   AND status = 'active') THEN
    RAISE EXCEPTION 'CROSS_CLAN';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_help_contributions
             WHERE request_id = p_request AND supporter_user_id = v_me) THEN
    RAISE EXCEPTION 'DUPLICATE';
  END IF;
  v_new := LEAST(p_amount, v_req.requested - v_req.fulfilled);
  IF v_new <= 0 THEN
    RAISE EXCEPTION 'CLOSED';
  END IF;
  SELECT COALESCE(sum(amount), 0)::int INTO v_spent
  FROM public.clan_help_contributions c
  JOIN public.clan_help_requests r ON r.id = c.request_id
  WHERE c.supporter_user_id = v_me AND r.created_at >= v_day::timestamptz;
  IF v_spent + v_new > 100 THEN
    RAISE EXCEPTION 'SUPPORTER_LIMIT';
  END IF;
  SELECT COALESCE(sum(c.amount), 0)::int INTO v_received
  FROM public.clan_help_contributions c
  JOIN public.clan_help_requests r ON r.id = c.request_id
  WHERE r.requester_user_id = v_req.requester_user_id
    AND r.created_at >= v_day::timestamptz;
  IF v_received + v_new > 50 THEN
    RAISE EXCEPTION 'REQUESTER_LIMIT';
  END IF;
  -- Supporter pays coins (sink); balance guarded row-level.
  UPDATE public.profiles SET coin_balance = coin_balance - v_new
  WHERE id = v_me AND coin_balance >= v_new;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS';
  END IF;
  v_debit_key := 'help:' || p_request::text || ':from:' || v_me::text || ':v1';
  v_credit_key := 'help:' || p_request::text || ':to:' || v_req.requester_user_id::text
    || ':' || v_me::text || ':v1';
  INSERT INTO public.coin_ledger
    (user_id, amount, source, source_type, reference_id, reason,
     metadata, balance_after)
  SELECT v_me, -v_new, 'clan_help', 'clan_help', v_debit_key, 'clan help given',
         jsonb_build_object('request_id', p_request),
         coin_balance
  FROM public.profiles WHERE id = v_me
  ON CONFLICT (user_id, source, reference_id) DO NOTHING;
  INSERT INTO public.xp_ledger
    (user_id, amount, source, source_type, reference_id, reason,
     metadata, balance_after)
  SELECT v_req.requester_user_id, v_new, 'clan_help', 'clan_help', v_credit_key,
         'clan help received', jsonb_build_object('request_id', p_request),
         COALESCE(xp_total, 0) + v_new
  FROM public.profiles WHERE id = v_req.requester_user_id
  ON CONFLICT (user_id, source, reference_id) DO NOTHING;
  UPDATE public.profiles SET xp_total = xp_total + v_new,
    current_level = (SELECT max(level) FROM public.levels
                     WHERE required_xp <= xp_total + v_new)
  WHERE id = v_req.requester_user_id AND EXISTS (
    SELECT 1 FROM public.xp_ledger
    WHERE user_id = v_req.requester_user_id AND reference_id = v_credit_key);
  INSERT INTO public.clan_help_contributions
    (request_id, supporter_user_id, amount, cost_coins)
  VALUES (p_request, v_me, v_new, v_new)
  ON CONFLICT (request_id, supporter_user_id) DO NOTHING;
  UPDATE public.clan_help_requests
  SET fulfilled = fulfilled + v_new,
      status = CASE WHEN fulfilled + v_new >= requested
                      THEN 'fulfilled'::public.clan_help_status
                    ELSE 'partially_fulfilled'::public.clan_help_status END
  WHERE id = p_request;
  PERFORM public.fn_log_clan(v_req.clan_id,
    CASE WHEN v_req.fulfilled + v_new >= v_req.requested
         THEN 'help_fulfilled' ELSE 'help_supported' END,
    v_me, jsonb_build_object('request_id', p_request, 'amount', v_new));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_link_clan_mission(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_link_clan_mission(uuid, uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_start_clan_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_start_clan_mission(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_clan_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_clan_mission(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_create_help_request(uuid, jsonb, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_help_request(uuid, jsonb, int, int) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_contribute_help(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contribute_help(uuid, int) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_expire_help_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_expire_help_requests() TO authenticated;
