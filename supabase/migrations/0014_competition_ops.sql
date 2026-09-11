-- M8 0014: competition operations (SECURITY DEFINER; RLS has no API writes).
-- Trust chain: fn re-validates everything (never trusts route input beyond
-- ids); scoring consumes M4 validated results only; rewards reuse M5 ledgers
-- with competition-scoped idempotency keys.

-- ---------------------------------------------------------------------------
-- Create (draft). Insert-then-gate: the row rolls back unless the caller can
-- manage its scope (super_admin, covering admin, or covering teacher).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_competition(
  p_slug text,
  p_title text,
  p_description text,
  p_type public.competition_type,
  p_visibility text,
  p_batches uuid[],
  p_courses uuid[],
  p_skill_bands text[],
  p_min_level int,
  p_min_accuracy numeric,
  p_min_wpm numeric,
  p_games text[],
  p_game_versions jsonb,
  p_scoring jsonb,
  p_tie_breakers text[],
  p_attempt_policy text,
  p_attempt_limit int,
  p_aggregate_strategy text,
  p_aggregate_n int,
  p_reward_policy jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reg_start timestamptz,
  p_reg_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
  v_slug text;
  v_gid uuid;
  v_ver uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'INVALID_WINDOW';
  END IF;
  IF p_reg_start IS NOT NULL AND p_reg_end IS NOT NULL
     AND NOT (p_reg_end > p_reg_start) THEN
    RAISE EXCEPTION 'INVALID_WINDOW';
  END IF;
  IF p_attempt_limit IS NULL OR p_attempt_limit <= 0 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;
  IF p_tie_breakers IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_tie_breakers) AS t
    WHERE t NOT IN ('score', 'accuracy', 'wpm', 'errors', 'earliest')
  ) THEN
    RAISE EXCEPTION 'INVALID_POLICY';
  END IF;
  IF COALESCE(p_scoring, '{"metric":"score"}'::jsonb) ->> 'metric'
     NOT IN ('wpm', 'accuracy', 'score', 'hybrid') THEN
    RAISE EXCEPTION 'INVALID_POLICY';
  END IF;

  INSERT INTO public.competitions
    (slug, title, description, type, visibility, organizer_id, status,
     eligibility, scoring, tie_breakers, attempt_policy, attempt_limit,
     aggregate_strategy, aggregate_n, reward_policy,
     starts_at, ends_at, registration_starts_at, registration_ends_at)
  VALUES
    (p_slug, p_title, COALESCE(p_description, ''), p_type,
     COALESCE(p_visibility, 'batch'), v_me, 'draft',
     jsonb_strip_nulls(jsonb_build_object(
       'batches', COALESCE(to_jsonb(p_batches), '[]'::jsonb),
       'courses', COALESCE(to_jsonb(p_courses), '[]'::jsonb),
       'skillBands', COALESCE(to_jsonb(p_skill_bands), '[]'::jsonb),
       'minLevel', p_min_level,
       'minAccuracy', p_min_accuracy,
       'minWpm', p_min_wpm)),
     COALESCE(p_scoring, '{"metric":"score"}'::jsonb),
     COALESCE(p_tie_breakers, ARRAY['score','accuracy','wpm','errors','earliest']),
     COALESCE(p_attempt_policy, 'BEST_SCORE'),
     p_attempt_limit, p_aggregate_strategy, p_aggregate_n,
     COALESCE(p_reward_policy, '{}'::jsonb),
     p_starts_at, p_ends_at, p_reg_start, p_reg_end)
  RETURNING id INTO v_id;

  -- Bind games (version pins resolved now; NULL pin = any version).
  FOR v_slug IN SELECT * FROM unnest(COALESCE(p_games, '{}')) LOOP
    SELECT id INTO v_gid FROM public.games
    WHERE slug = v_slug AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GAME_UNKNOWN';
    END IF;
    v_ver := NULL;
    IF p_game_versions IS NOT NULL AND (p_game_versions ? v_slug) THEN
      SELECT id INTO v_ver FROM public.game_versions
      WHERE game_id = v_gid AND version = (p_game_versions ->> v_slug)::int;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_UNKNOWN';
      END IF;
    END IF;
    INSERT INTO public.competition_games (competition_id, game_id, game_version_id)
    VALUES (v_id, v_gid, v_ver);
  END LOOP;

  IF NOT public.fn_can_manage_competition(v_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  INSERT INTO public.competition_state_events (competition_id, actor_user_id, to_status)
  VALUES (v_id, v_me, 'draft');
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Draft edits (whitelisted fields only; games replace atomically).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_update_competition_draft(
  p_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.competition_status;
  v_slug text;
  v_gid uuid;
BEGIN
  IF NOT public.fn_can_manage_competition(p_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT status INTO v_status FROM public.competitions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;

  UPDATE public.competitions SET
    title = COALESCE((p_patch ->> 'title'), title),
    description = COALESCE((p_patch ->> 'description'), description),
    eligibility = COALESCE(p_patch -> 'eligibility', eligibility),
    scoring = COALESCE(p_patch -> 'scoring', scoring),
    tie_breakers = COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(p_patch -> 'tie_breakers') AS x),
      tie_breakers),
    attempt_policy = COALESCE((p_patch ->> 'attempt_policy'), attempt_policy),
    attempt_limit = COALESCE((p_patch ->> 'attempt_limit')::int, attempt_limit),
    reward_policy = COALESCE(p_patch -> 'reward_policy', reward_policy),
    starts_at = COALESCE((p_patch ->> 'starts_at')::timestamptz, starts_at),
    ends_at = COALESCE((p_patch ->> 'ends_at')::timestamptz, ends_at)
  WHERE id = p_id;

  IF p_patch ? 'game_slugs' THEN
    DELETE FROM public.competition_games WHERE competition_id = p_id;
    FOR v_slug IN SELECT * FROM jsonb_array_elements_text(p_patch -> 'game_slugs') LOOP
      SELECT id INTO v_gid FROM public.games
      WHERE slug = v_slug AND is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'GAME_UNKNOWN';
      END IF;
      INSERT INTO public.competition_games (competition_id, game_id)
      VALUES (p_id, v_gid);
    END LOOP;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Transitions (explicit map + time guards; every hop writes a state event).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_transition_competition(
  p_id uuid,
  p_to public.competition_status
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_from public.competition_status;
  v_row public.competitions%ROWTYPE;
  v_ok boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.fn_can_manage_competition(p_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_row FROM public.competitions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  v_from := v_row.status;

  v_ok := CASE
    WHEN v_from = 'draft' AND p_to IN ('scheduled', 'cancelled') THEN true
    WHEN v_from = 'scheduled' AND p_to IN ('registration_open', 'cancelled') THEN true
    WHEN v_from = 'registration_open' AND p_to IN ('registration_closed', 'live', 'cancelled', 'paused') THEN true
    WHEN v_from = 'registration_closed' AND p_to IN ('registration_open', 'live', 'cancelled') THEN true
    WHEN v_from = 'live' AND p_to IN ('ended', 'paused', 'cancelled') THEN true
    WHEN v_from = 'paused' AND p_to IN ('live', 'cancelled') THEN true
    WHEN v_from = 'ended' AND p_to IN ('processing', 'cancelled') THEN true
    WHEN v_from = 'processing' AND p_to IN ('finalized', 'ended') THEN true
    ELSE false
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION';
  END IF;
  IF p_to = 'live' AND now() < v_row.starts_at THEN
    RAISE EXCEPTION 'TOO_EARLY';
  END IF;
  IF p_to = 'registration_open' AND v_row.registration_starts_at IS NOT NULL
     AND now() < v_row.registration_starts_at THEN
    RAISE EXCEPTION 'TOO_EARLY';
  END IF;

  UPDATE public.competitions SET status = p_to WHERE id = p_id;
  INSERT INTO public.competition_state_events
    (competition_id, actor_user_id, from_status, to_status)
  VALUES (p_id, v_me, v_from, p_to);
END;
$$;

-- ---------------------------------------------------------------------------
-- Registration (window + full eligibility, server-evaluated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_register_entry(p_competition uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_comp public.competitions%ROWTYPE;
  v_prof public.profiles%ROWTYPE;
  v_member record;
  v_best_acc numeric;
  v_best_wpm numeric;
  v_entry uuid;
  v_elig jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_comp.status <> 'registration_open' THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;
  IF v_comp.registration_starts_at IS NOT NULL
     AND now() < v_comp.registration_starts_at THEN
    RAISE EXCEPTION 'REGISTRATION_NOT_OPEN';
  END IF;
  IF v_comp.registration_ends_at IS NOT NULL
     AND now() > v_comp.registration_ends_at THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_me;
  IF NOT FOUND OR v_prof.account_status <> 'active' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.competition_entries
    WHERE competition_id = p_competition AND user_id = v_me
  ) THEN
    RAISE EXCEPTION 'ALREADY_REGISTERED';
  END IF;

  v_elig := v_comp.eligibility;

  -- Qualifying active membership (batch gate, else course gate, else any).
  SELECT bm.* INTO v_member
  FROM public.batch_members bm
  JOIN public.batches b ON b.id = bm.batch_id
  WHERE bm.user_id = v_me AND bm.is_active
    AND (
      NOT (v_elig ? 'batches' AND jsonb_array_length(v_elig -> 'batches') > 0)
      OR bm.batch_id::text IN (
        SELECT jsonb_array_elements_text(v_elig -> 'batches'))
    )
    AND (
      NOT (v_elig ? 'courses' AND jsonb_array_length(v_elig -> 'courses') > 0)
      OR b.course_id::text IN (
        SELECT jsonb_array_elements_text(v_elig -> 'courses'))
    )
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_INELIGIBLE';
  END IF;

  IF v_elig ? 'skillBands'
     AND jsonb_array_length(v_elig -> 'skillBands') > 0
     AND NOT (v_member.skill_track::text = ANY (
       SELECT jsonb_array_elements_text(v_elig -> 'skillBands'))) THEN
    RAISE EXCEPTION 'SKILL_INELIGIBLE';
  END IF;

  SELECT COALESCE(max(r.accuracy), 0), COALESCE(max(r.effective_wpm), 0)
  INTO v_best_acc, v_best_wpm
  FROM public.attempt_results r
  JOIN public.game_attempts a ON a.id = r.attempt_id
  WHERE a.user_id = v_me AND r.is_valid;

  IF (v_elig ->> 'minLevel')::int > 0
     AND v_prof.current_level < (v_elig ->> 'minLevel')::int THEN
    RAISE EXCEPTION 'LEVEL_TOO_LOW';
  END IF;
  IF (v_elig ->> 'minAccuracy')::numeric > 0
     AND v_best_acc < (v_elig ->> 'minAccuracy')::numeric THEN
    RAISE EXCEPTION 'ACCURACY_TOO_LOW';
  END IF;
  IF (v_elig ->> 'minWpm')::numeric > 0
     AND v_best_wpm < (v_elig ->> 'minWpm')::numeric THEN
    RAISE EXCEPTION 'WPM_TOO_LOW';
  END IF;

  INSERT INTO public.competition_entries
    (competition_id, user_id, batch_id, skill_band, status)
  VALUES
    (p_competition, v_me, v_member.batch_id, v_member.skill_track, 'registered')
  RETURNING id INTO v_entry;
  RETURN v_entry;
END;
$$;

-- ---------------------------------------------------------------------------
-- Attach a validated M4 attempt to an entry (all gates re-checked).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_attach_attempt(
  p_competition uuid,
  p_attempt_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_comp public.competitions%ROWTYPE;
  v_entry public.competition_entries%ROWTYPE;
  v_attempt public.game_attempts%ROWTYPE;
  v_result public.attempt_results%ROWTYPE;
  v_count int;
  v_link uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  SELECT * INTO v_comp FROM public.competitions WHERE id = p_competition;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_comp.status <> 'live' THEN
    RAISE EXCEPTION 'NOT_LIVE';
  END IF;
  IF now() < v_comp.starts_at OR now() > v_comp.ends_at THEN
    RAISE EXCEPTION 'OUTSIDE_WINDOW';
  END IF;

  SELECT * INTO v_entry FROM public.competition_entries
  WHERE competition_id = p_competition AND user_id = v_me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_REGISTERED';
  END IF;
  IF v_entry.status <> 'registered' THEN
    RAISE EXCEPTION 'ENTRY_INVALID';
  END IF;

  SELECT * INTO v_attempt FROM public.game_attempts WHERE id = p_attempt_id;
  IF NOT FOUND OR v_attempt.user_id <> v_me THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.status <> 'validated' THEN
    RAISE EXCEPTION 'ATTEMPT_INVALID';
  END IF;
  IF v_attempt.created_at < v_comp.starts_at OR v_attempt.created_at > v_comp.ends_at THEN
    RAISE EXCEPTION 'OUTSIDE_WINDOW';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.competition_games
    WHERE competition_id = p_competition AND game_id = v_attempt.game_id
      AND (game_version_id IS NULL OR game_version_id = v_attempt.game_version_id)
  ) THEN
    RAISE EXCEPTION 'GAME_NOT_ALLOWED';
  END IF;

  SELECT count(*) INTO v_count FROM public.competition_attempts
  WHERE entry_id = v_entry.id;
  IF v_count >= v_comp.attempt_limit THEN
    RAISE EXCEPTION 'ATTEMPT_LIMIT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.competition_attempts WHERE attempt_id = p_attempt_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ATTEMPT';
  END IF;

  SELECT * INTO v_result FROM public.attempt_results WHERE attempt_id = p_attempt_id;
  IF NOT FOUND OR NOT v_result.is_valid THEN
    RAISE EXCEPTION 'ATTEMPT_INVALID';
  END IF;

  INSERT INTO public.competition_attempts (competition_id, entry_id, attempt_id)
  VALUES (p_competition, v_entry.id, p_attempt_id)
  RETURNING id INTO v_link;
  RETURN v_link;
END;
$$;
