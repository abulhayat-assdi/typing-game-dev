-- M14 tournament operations: admin CRUD, registration, deterministic
-- seeding + bracket generation, match orchestration over existing
-- war/competition contexts, idempotent M5 rewards, optional season sync,
-- scheduler sweep. Students never write tournament state (no write
-- policies; every mutation is a role-checked SECURITY DEFINER fn).

CREATE OR REPLACE FUNCTION public.fn_log_tournament(
  p_tournament uuid, p_from public.tournament_status,
  p_to public.tournament_status, p_actor uuid
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.tournament_state_events
    (tournament_id, from_status, to_status, actor_user_id)
  VALUES (p_tournament, p_from, p_to, p_actor);
$$;

-- Admin gate: global admins manage everything; org admins manage their
-- organization's tournaments only. Students/teachers never pass.
CREATE OR REPLACE FUNCTION public.fn_require_tournament_admin(
  p_tournament uuid DEFAULT NULL,
  p_org uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF public.is_super_admin() OR public.fn_is_mission_admin() THEN
    RETURN;
  END IF;
  v_org := p_org;
  IF p_tournament IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.tournaments
    WHERE id = p_tournament;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
  END IF;
  IF v_org IS NOT NULL AND public.is_org_admin(v_org) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_tournament(p_def jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_org uuid;
  v_format text;
  v_ptype text;
BEGIN
  v_org := NULLIF(p_def ->> 'organization_id', '')::uuid;
  PERFORM public.fn_require_tournament_admin(NULL, v_org);
  -- Global (organization-less) tournaments are super/mission admin only,
  -- enforced inside fn_require_tournament_admin (org admins need an org).
  v_format := COALESCE(p_def ->> 'format', 'single_elimination');
  v_ptype := p_def ->> 'participant_type';
  IF p_def ->> 'slug' IS NULL OR p_def ->> 'name' IS NULL
     OR v_ptype NOT IN ('clan', 'student') THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF v_format <> 'single_elimination' THEN
    RAISE EXCEPTION 'FORMAT_NOT_YET_IMPLEMENTED';
  END IF;
  IF (p_def ->> 'registration_end')::timestamptz IS NOT NULL
     AND (p_def ->> 'registration_start')::timestamptz IS NOT NULL
     AND (p_def ->> 'registration_end')::timestamptz
       <= (p_def ->> 'registration_start')::timestamptz THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF (p_def ->> 'end_at')::timestamptz IS NOT NULL
     AND (p_def ->> 'start_at')::timestamptz IS NOT NULL
     AND (p_def ->> 'end_at')::timestamptz
       <= (p_def ->> 'start_at')::timestamptz THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.tournaments (
    slug, name, description, theme, format, participant_type,
    organization_id, registration_start, registration_end,
    start_at, end_at, participant_cap,
    eligibility, scoring_policy, reward_policy, rules,
    season_id, source_context)
  VALUES (
    p_def ->> 'slug', p_def ->> 'name',
    COALESCE(p_def ->> 'description', ''),
    COALESCE(p_def ->> 'theme', ''),
    v_format::public.tournament_format,
    v_ptype::public.tournament_participant_type,
    v_org,
    (p_def ->> 'registration_start')::timestamptz,
    (p_def ->> 'registration_end')::timestamptz,
    (p_def ->> 'start_at')::timestamptz,
    (p_def ->> 'end_at')::timestamptz,
    NULLIF(p_def ->> 'participant_cap', '')::int,
    COALESCE(p_def -> 'eligibility', '{}'::jsonb),
    COALESCE(p_def -> 'scoring_policy', '{}'::jsonb),
    COALESCE(p_def -> 'reward_policy', '{}'::jsonb),
    COALESCE(p_def -> 'rules', '{}'::jsonb),
    NULLIF(p_def ->> 'season_id', '')::uuid,
    COALESCE(p_def -> 'source_context', '{}'::jsonb))
  RETURNING id INTO v_id;
  INSERT INTO public.tournament_versions (tournament_id, version, definition)
  SELECT v_id, version, to_jsonb(t.*) - 'created_at' - 'updated_at'
  FROM public.tournaments t WHERE t.id = v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_SLUG';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_tournament_draft(
  p_tournament uuid, p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  IF NOT EXISTS (SELECT 1 FROM public.tournaments
                 WHERE id = p_tournament AND status = 'draft') THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  UPDATE public.tournaments SET
    name = COALESCE(NULLIF(p_patch ->> 'name', ''), name),
    description = COALESCE(p_patch ->> 'description', description),
    theme = COALESCE(p_patch ->> 'theme', theme),
    eligibility = COALESCE(p_patch -> 'eligibility', eligibility),
    scoring_policy = COALESCE(p_patch -> 'scoring_policy', scoring_policy),
    reward_policy = COALESCE(p_patch -> 'reward_policy', reward_policy),
    rules = COALESCE(p_patch -> 'rules', rules),
    registration_start = COALESCE(
      (p_patch ->> 'registration_start')::timestamptz, registration_start),
    registration_end = COALESCE(
      (p_patch ->> 'registration_end')::timestamptz, registration_end),
    start_at = COALESCE((p_patch ->> 'start_at')::timestamptz, start_at),
    end_at = COALESCE((p_patch ->> 'end_at')::timestamptz, end_at),
    version = version + 1,
    updated_at = now()
  WHERE id = p_tournament;
  INSERT INTO public.tournament_versions (tournament_id, version, definition)
  SELECT p_tournament, version, to_jsonb(t.*) - 'created_at' - 'updated_at'
  FROM public.tournaments t WHERE t.id = p_tournament;
END;
$$;

-- publish: draft -> registration_open. close: registration_open ->
-- registration_closed. cancel: where permitted.
CREATE OR REPLACE FUNCTION public.fn_publish_tournament(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  UPDATE public.tournaments SET status = 'registration_open',
    updated_at = now()
  WHERE id = p_tournament AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  PERFORM public.fn_log_tournament(
    p_tournament, 'draft', 'registration_open', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_close_registration(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  UPDATE public.tournaments SET status = 'registration_closed',
    updated_at = now()
  WHERE id = p_tournament AND status = 'registration_open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  PERFORM public.fn_log_tournament(
    p_tournament, 'registration_open', 'registration_closed', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cancel_tournament(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.tournament_status;
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status NOT IN ('draft', 'registration_open', 'registration_closed',
                      'seeded', 'live') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  UPDATE public.tournaments SET status = 'cancelled', updated_at = now()
  WHERE id = p_tournament;
  UPDATE public.tournament_matches SET status = 'cancelled',
    updated_at = now()
  WHERE tournament_id = p_tournament AND status NOT IN ('finalized', 'bye');
  UPDATE public.tournament_rounds SET status = 'cancelled'
  WHERE tournament_id = p_tournament;
  PERFORM public.fn_log_tournament(
    p_tournament, v_status, 'cancelled', auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- Registration: students self-register; clans are registered by their
-- staff (leader/co-leader). Eligibility + window + cap + duplicates
-- enforced here; forged IDs fail the existence/eligibility proofs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_register_tournament(
  p_tournament uuid, p_clan uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_t record;
  v_pid uuid;
  v_name text;
  v_existing text;
  v_count int;
  v_cap int;
  v_min int;
  v_courses uuid[];
  v_batches uuid[];
  v_org uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_t.status <> 'registration_open' THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;
  IF v_t.registration_start IS NOT NULL AND now() < v_t.registration_start THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;
  IF v_t.registration_end IS NOT NULL AND now() >= v_t.registration_end THEN
    RAISE EXCEPTION 'REGISTRATION_CLOSED';
  END IF;
  SELECT COALESCE((v_t.eligibility ->> 'min_level')::int, 1) INTO v_min;
  SELECT COALESCE(array_agg(x::uuid) FILTER (WHERE x ~ '^[0-9a-fA-F-]{36}$'), '{}')
    INTO v_courses
  FROM jsonb_array_elements_text(
    COALESCE(v_t.eligibility -> 'course_ids', '[]'::jsonb)) AS x;
  SELECT COALESCE(array_agg(x::uuid) FILTER (WHERE x ~ '^[0-9a-fA-F-]{36}$'), '{}')
    INTO v_batches
  FROM jsonb_array_elements_text(
    COALESCE(v_t.eligibility -> 'batch_ids', '[]'::jsonb)) AS x;
  SELECT NULLIF(v_t.eligibility ->> 'organization_id', '')::uuid INTO v_org;

  IF v_t.participant_type = 'student' THEN
    IF p_clan IS NOT NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    v_pid := v_me;
    SELECT COALESCE(NULLIF(full_name, ''), 'Player') INTO v_name
    FROM public.profiles
    WHERE id = v_me AND account_status = 'active'
      AND COALESCE(current_level, 1) >= v_min;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INELIGIBLE';
    END IF;
    IF v_courses <> '{}' AND NOT EXISTS (
        SELECT 1 FROM public.batch_members bm
        JOIN public.batches b ON b.id = bm.batch_id
        WHERE bm.user_id = v_me AND bm.is_active
          AND b.course_id = ANY (v_courses)) THEN
      RAISE EXCEPTION 'INELIGIBLE';
    END IF;
    IF v_batches <> '{}' AND NOT EXISTS (
        SELECT 1 FROM public.batch_members bm
        WHERE bm.user_id = v_me AND bm.is_active
          AND bm.batch_id = ANY (v_batches)) THEN
      RAISE EXCEPTION 'INELIGIBLE';
    END IF;
  ELSE
    IF p_clan IS NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    IF NOT public.fn_is_clan_staff(p_clan, v_me)
       AND NOT public.fn_is_tournament_admin(p_tournament) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    v_pid := p_clan;
    SELECT name INTO v_name FROM public.clans
    WHERE id = p_clan AND status = 'active'
      AND (v_org IS NULL OR organization_id = v_org);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INELIGIBLE';
    END IF;
  END IF;

  SELECT status INTO v_existing FROM public.tournament_participants
  WHERE tournament_id = p_tournament AND participant_id = v_pid;
  IF FOUND THEN
    IF v_existing = 'active' THEN
      RAISE EXCEPTION 'DUPLICATE';
    END IF;
    UPDATE public.tournament_participants SET status = 'active',
      snapshot = COALESCE(snapshot, '{}'::jsonb)
    WHERE tournament_id = p_tournament AND participant_id = v_pid;
    RETURN;
  END IF;
  v_cap := v_t.participant_cap;
  IF v_cap IS NOT NULL THEN
    SELECT count(*)::int INTO v_count FROM public.tournament_participants
    WHERE tournament_id = p_tournament AND status = 'active';
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'PARTICIPANT_CAP';
    END IF;
  END IF;
  INSERT INTO public.tournament_participants
    (tournament_id, participant_type, participant_id, display_name, snapshot)
  VALUES (p_tournament, v_t.participant_type, v_pid, v_name,
    jsonb_build_object('registered_by', v_me));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_withdraw_tournament(
  p_tournament uuid, p_clan uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_status public.tournament_status;
  v_ptype public.tournament_participant_type;
  v_pid uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT status, participant_type INTO v_status, v_ptype
  FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status NOT IN ('registration_open', 'registration_closed') THEN
    RAISE EXCEPTION 'REGISTRATION_LOCKED';
  END IF;
  IF v_ptype = 'student' THEN
    v_pid := v_me;
  ELSE
    IF p_clan IS NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    IF NOT public.fn_is_clan_staff(p_clan, v_me)
       AND NOT public.fn_is_tournament_admin(p_tournament) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    v_pid := p_clan;
  END IF;
  UPDATE public.tournament_participants SET status = 'withdrawn'
  WHERE tournament_id = p_tournament AND participant_id = v_pid
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seeding + deterministic single-elimination bracket generation.
-- registration_closed -> seeded. The roster freezes here: registration
-- and withdrawal are status-gated above, so post-seed lists are
-- immutable (admin substitution before live is an audited adjustment).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_seed_tournament(
  p_tournament uuid, p_method text DEFAULT 'manual',
  p_order uuid[] DEFAULT NULL, p_seed int DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record;
  v_ids uuid[];
  v_n int;
  v_slots int;
  v_rounds int;
  v_positions int[];
  v_size int;
  v_new int[];
  v_i int;
  v_r int;
  v_s int;
  v_a uuid;
  v_b uuid;
  v_round uuid;
  v_match uuid;
  v_parent uuid;
  v_side text;
  v_name text;
  v_season uuid;
  v_row record;
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_t.status <> 'registration_closed' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF v_t.format <> 'single_elimination' THEN
    RAISE EXCEPTION 'FORMAT_NOT_YET_IMPLEMENTED';
  END IF;

  -- Ordered participant ids per seeding method (deterministic).
  IF p_method = 'manual' THEN
    IF p_order IS NULL OR array_length(p_order, 1) IS NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    SELECT array_agg(q.pid ORDER BY q.ord) INTO v_ids
    FROM unnest(p_order) WITH ORDINALITY AS q(pid, ord);
    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS x
               GROUP BY x HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'DUPLICATE';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS x
               WHERE NOT EXISTS (
                 SELECT 1 FROM public.tournament_participants p
                 WHERE p.tournament_id = p_tournament
                   AND p.participant_id = x AND p.status = 'active')) THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    IF (SELECT count(*) FROM public.tournament_participants
        WHERE tournament_id = p_tournament AND status = 'active')
       <> array_length(v_ids, 1) THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
  ELSIF p_method = 'season_ranking' THEN
    v_season := v_t.season_id;
    IF v_season IS NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    -- Frozen snapshot preferred; live board computed once and stored as
    -- the frozen reference when no snapshot exists yet.
    SELECT array_agg(q.pid ORDER BY q.ord) INTO v_ids
    FROM (
      SELECT (e ->> 'participant_id')::uuid AS pid,
             ROW_NUMBER() OVER () AS ord
      FROM public.season_leaderboard_snapshots s,
           jsonb_array_elements(s.board) AS e
      WHERE s.season_id = v_season
        AND s.participant_type = v_t.participant_type::text
      LIMIT 1000000
    ) AS q
    WHERE EXISTS (SELECT 1 FROM public.tournament_participants p
                  WHERE p.tournament_id = p_tournament
                    AND p.participant_id = q.pid AND p.status = 'active');
    IF v_ids IS NULL THEN
      SELECT array_agg(b.participant_id ORDER BY b.rank) INTO v_ids
      FROM public.fn_season_leaderboard(
        v_season, v_t.participant_type::text, 1000000) AS b
      WHERE EXISTS (SELECT 1 FROM public.tournament_participants p
                    WHERE p.tournament_id = p_tournament
                      AND p.participant_id = b.participant_id
                      AND p.status = 'active');
    END IF;
    IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    -- Ranked entrants first, then unranked by id (still deterministic).
    SELECT v_ids || COALESCE(array_agg(p.participant_id ORDER BY p.participant_id), '{}')
      INTO v_ids
    FROM public.tournament_participants p
    WHERE p.tournament_id = p_tournament AND p.status = 'active'
      AND NOT (p.participant_id = ANY (v_ids));
  ELSIF p_method = 'random' THEN
    IF p_seed IS NULL THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    SELECT array_agg(p.participant_id ORDER BY md5(p_seed::text || p.participant_id::text))
      INTO v_ids
    FROM public.tournament_participants p
    WHERE p.tournament_id = p_tournament AND p.status = 'active';
  ELSE
    RAISE EXCEPTION 'MALFORMED';
  END IF;

  v_n := COALESCE(array_length(v_ids, 1), 0);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'TOO_FEW_PARTICIPANTS';
  END IF;

  INSERT INTO public.tournament_seeding
    (tournament_id, participant_id, seed, source, snapshot_ref)
  SELECT p_tournament, q.pid, q.ord,
         CASE p_method WHEN 'manual' THEN 'manual'
              WHEN 'season_ranking' THEN 'season_ranking'
              ELSE 'random:' || (p_seed::text) END,
         jsonb_build_object('method', p_method, 'season_id', v_season,
                            'seed', p_seed, 'seeded_at', now())
  FROM unnest(v_ids) WITH ORDINALITY AS q(pid, ord);

  -- Power-of-two slots + canonical seed placement order.
  v_slots := 1;
  WHILE v_slots < v_n LOOP
    v_slots := v_slots * 2;
  END LOOP;
  v_rounds := 0;
  v_size := 1;
  WHILE v_size < v_slots LOOP
    v_size := v_size * 2;
    v_rounds := v_rounds + 1;
  END LOOP;
  v_positions := ARRAY[1];
  v_size := 1;
  WHILE v_size < v_slots LOOP
    v_size := v_size * 2;
    v_new := '{}';
    FOR v_i IN 1 .. array_length(v_positions, 1) LOOP
      v_new := v_new || v_positions[v_i] || (v_size + 1 - v_positions[v_i]);
    END LOOP;
    v_positions := v_new;
  END LOOP;

  -- Rounds (named from the final backwards).
  FOR v_r IN 1 .. v_rounds LOOP
    v_name := CASE v_rounds - v_r
      WHEN 0 THEN 'Final'
      WHEN 1 THEN 'Semifinals'
      WHEN 2 THEN 'Quarterfinals'
      ELSE 'Round of ' || power(2, v_rounds - v_r + 1)::int::text END;
    INSERT INTO public.tournament_rounds (tournament_id, round_no, name)
    VALUES (p_tournament, v_r, v_name);
  END LOOP;

  -- Round 1 from placement; byes auto-advance with an audit trail.
  FOR v_s IN 1 .. (v_slots / 2) LOOP
    v_a := CASE WHEN v_positions[2 * v_s - 1] <= v_n
                THEN v_ids[v_positions[2 * v_s - 1]] ELSE NULL END;
    v_b := CASE WHEN v_positions[2 * v_s] <= v_n
                THEN v_ids[v_positions[2 * v_s]] ELSE NULL END;
    SELECT id INTO v_round FROM public.tournament_rounds
    WHERE tournament_id = p_tournament AND round_no = 1;
    IF v_a IS NOT NULL AND v_b IS NOT NULL THEN
      INSERT INTO public.tournament_matches
        (tournament_id, round_id, slot, participant_a, participant_b,
         status, source_type)
      VALUES (p_tournament, v_round, v_s, v_a, v_b, 'pending',
        CASE WHEN (v_t.scoring_policy ->> 'source') = 'competition'
             THEN 'competition'::public.tournament_match_source
             ELSE 'clan_war'::public.tournament_match_source END)
      RETURNING id INTO v_match;
      INSERT INTO public.tournament_match_participants
        (match_id, participant_id, side)
      VALUES (v_match, v_a, 'a'), (v_match, v_b, 'b');
    ELSE
      INSERT INTO public.tournament_matches
        (tournament_id, round_id, slot,
         participant_a, participant_b, status, source_type,
         winner_id, loser_id, finalized_at)
      VALUES (p_tournament, v_round, v_s, v_a, v_b, 'bye', 'bye',
        COALESCE(v_a, v_b), NULL, now())
      RETURNING id INTO v_match;
      INSERT INTO public.tournament_match_participants
        (match_id, participant_id, side)
      VALUES (v_match, COALESCE(v_a, v_b),
        CASE WHEN v_a IS NOT NULL THEN 'a' ELSE 'b' END);
      INSERT INTO public.tournament_adjustments
        (tournament_id, scope, ref_id, old_value, new_value, reason,
         created_by)
      VALUES (p_tournament, 'bye', v_match,
        jsonb_build_object('match_id', v_match),
        jsonb_build_object('advanced', COALESCE(v_a, v_b)),
        'first-round bye auto-advance', auth.uid());
    END IF;
  END LOOP;

  -- Later rounds: empty slots wired to their child matches.
  FOR v_r IN 2 .. v_rounds LOOP
    FOR v_s IN 1 .. (v_slots / power(2, v_r)::int) LOOP
      SELECT id INTO v_round FROM public.tournament_rounds
      WHERE tournament_id = p_tournament AND round_no = v_r;
      INSERT INTO public.tournament_matches
        (tournament_id, round_id, slot, child_match_a, child_match_b,
         status, source_type)
      SELECT p_tournament, v_round, v_s, ca.id, cb.id, 'pending',
        CASE WHEN (v_t.scoring_policy ->> 'source') = 'competition'
             THEN 'competition'::public.tournament_match_source
             ELSE 'clan_war'::public.tournament_match_source END
      FROM (SELECT m.id FROM public.tournament_matches m
            JOIN public.tournament_rounds r ON r.id = m.round_id
            WHERE m.tournament_id = p_tournament AND r.round_no = v_r - 1
              AND m.slot = 2 * v_s - 1) AS ca,
           (SELECT m.id FROM public.tournament_matches m
            JOIN public.tournament_rounds r ON r.id = m.round_id
            WHERE m.tournament_id = p_tournament AND r.round_no = v_r - 1
              AND m.slot = 2 * v_s) AS cb
      RETURNING id INTO v_match;
    END LOOP;
  END LOOP;

  -- Propagate bye winners into round-2 slots immediately.
  FOR v_row IN
    SELECT m.id AS mid, m.slot, m.winner_id AS w
    FROM public.tournament_matches m
    JOIN public.tournament_rounds r ON r.id = m.round_id
    WHERE m.tournament_id = p_tournament AND r.round_no = 1
      AND m.status = 'bye'
  LOOP
    SELECT m.id INTO v_parent FROM public.tournament_matches m
    JOIN public.tournament_rounds r ON r.id = m.round_id
    WHERE m.tournament_id = p_tournament AND r.round_no = 2
      AND m.slot = ((v_row.slot + 1) / 2)::int;
    IF FOUND THEN
      v_side := CASE WHEN v_row.slot % 2 = 1 THEN 'a' ELSE 'b' END;
      IF v_side = 'a' THEN
        UPDATE public.tournament_matches SET participant_a = v_row.w
        WHERE id = v_parent;
      ELSE
        UPDATE public.tournament_matches SET participant_b = v_row.w
        WHERE id = v_parent;
      END IF;
      INSERT INTO public.tournament_match_participants
        (match_id, participant_id, side)
      VALUES (v_parent, v_row.w, v_side)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.tournaments SET status = 'seeded', updated_at = now()
  WHERE id = p_tournament;
  PERFORM public.fn_log_tournament(
    p_tournament, 'registration_closed', 'seeded', auth.uid());
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Match lifecycle + orchestration. The engine never scores typing: a
-- clan_war-sourced match derives its score from the finalized war
-- results; all other sources are attested scores recorded by an admin
-- (e.g. transcribed from a competition board). Participants can never
-- write scores or advance themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tmatch_decide(
  p_tournament uuid, p_a uuid, p_b uuid,
  p_score_a numeric, p_score_b numeric, p_metrics jsonb
)
RETURNS TABLE (winner uuid, loser uuid, tie_break text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_breakers text[];
  v_key text;
  v_da numeric;
  v_db numeric;
  v_ea numeric;
  v_eb numeric;
BEGIN
  SELECT COALESCE(
    array_agg(x ORDER BY o.ord) FILTER (WHERE x IS NOT NULL), '{}')
    INTO v_breakers
  FROM jsonb_array_elements_text(
    COALESCE((SELECT scoring_policy -> 'tie_breakers'
              FROM public.tournaments WHERE id = p_tournament),
             '["score","accuracy","best","participation","earliest"]'::jsonb)
  ) WITH ORDINALITY AS o(x, ord);
  IF p_score_a IS DISTINCT FROM p_score_b THEN
    IF p_score_a > p_score_b THEN
      RETURN QUERY SELECT p_a, p_b, NULL::text;
    ELSE
      RETURN QUERY SELECT p_b, p_a, NULL::text;
    END IF;
    RETURN;
  END IF;
  FOREACH v_key IN ARRAY v_breakers LOOP
    IF v_key = 'score' THEN
      CONTINUE;
    ELSIF v_key = 'accuracy' THEN
      v_da := COALESCE((p_metrics ->> 'accuracy_a')::numeric, 0);
      v_db := COALESCE((p_metrics ->> 'accuracy_b')::numeric, 0);
    ELSIF v_key = 'best' THEN
      v_da := COALESCE((p_metrics ->> 'best_a')::numeric, 0);
      v_db := COALESCE((p_metrics ->> 'best_b')::numeric, 0);
    ELSIF v_key = 'participation' THEN
      v_da := COALESCE((p_metrics ->> 'participation_a')::numeric, 0);
      v_db := COALESCE((p_metrics ->> 'participation_b')::numeric, 0);
    ELSIF v_key = 'earliest' THEN
      v_ea := (p_metrics ->> 'earliest_a')::numeric;
      v_eb := (p_metrics ->> 'earliest_b')::numeric;
      IF v_ea IS NULL OR v_eb IS NULL THEN
        CONTINUE;
      END IF;
      -- Earlier qualifying result wins.
      IF v_ea IS DISTINCT FROM v_eb THEN
        IF v_ea < v_eb THEN
          RETURN QUERY SELECT p_a, p_b, 'earliest'::text;
        ELSE
          RETURN QUERY SELECT p_b, p_a, 'earliest'::text;
        END IF;
        RETURN;
      END IF;
      CONTINUE;
    ELSE
      CONTINUE;
    END IF;
    IF v_da IS DISTINCT FROM v_db THEN
      IF v_da > v_db THEN
        RETURN QUERY SELECT p_a, p_b, v_key;
      ELSE
        RETURN QUERY SELECT p_b, p_a, v_key;
      END IF;
      RETURN;
    END IF;
  END LOOP;
  -- Total order fallback (server-side, never the frontend).
  IF p_a < p_b THEN
    RETURN QUERY SELECT p_a, p_b, 'participant_id'::text;
  ELSE
    RETURN QUERY SELECT p_b, p_a, 'participant_id'::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_start_tournament(p_tournament uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  UPDATE public.tournaments SET status = 'live', updated_at = now()
  WHERE id = p_tournament AND status = 'seeded';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  UPDATE public.tournament_matches m SET status = 'ready', updated_at = now()
  FROM public.tournament_rounds r
  WHERE m.round_id = r.id AND m.tournament_id = p_tournament
    AND r.round_no = 1 AND m.status = 'pending'
    AND m.participant_a IS NOT NULL AND m.participant_b IS NOT NULL;
  PERFORM public.fn_log_tournament(
    p_tournament, 'seeded', 'live', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_open_tmatch(p_match uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t uuid;
BEGIN
  SELECT tournament_id INTO v_t FROM public.tournament_matches
  WHERE id = p_match;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  PERFORM public.fn_require_tournament_admin(v_t);
  UPDATE public.tournament_matches SET status = 'live', updated_at = now()
  WHERE id = p_match AND status = 'ready';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
END;
$$;

-- Finalize one match: verify source, resolve the winner deterministically,
-- advance exactly once into the parent slot. Idempotent replays of an
-- already-advanced winner are no-ops; conflicts raise DUPLICATE.
CREATE OR REPLACE FUNCTION public.fn_finalize_tmatch(
  p_match uuid, p_score_a numeric DEFAULT NULL,
  p_score_b numeric DEFAULT NULL, p_metrics jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m record;
  v_t record;
  v_sa numeric := p_score_a;
  v_sb numeric := p_score_b;
  v_win uuid;
  v_lose uuid;
  v_tie text;
  v_parent record;
  v_side text;
  v_occupant uuid;
  v_war_status text;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_match;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_m.tournament_id;
  PERFORM public.fn_require_tournament_admin(v_m.tournament_id);
  IF v_t.status <> 'live' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF v_m.status = 'finalized' OR v_m.status = 'bye' THEN
    RAISE EXCEPTION 'IMMUTABLE';
  END IF;
  IF v_m.status NOT IN ('live', 'processing') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF v_m.participant_a IS NULL OR v_m.participant_b IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  -- Clan-war sourced matches prove their score against the war engine.
  IF v_m.source_type = 'clan_war' AND v_m.source_id IS NOT NULL THEN
    SELECT status::text INTO v_war_status FROM public.clan_wars
    WHERE id = v_m.source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    IF v_war_status <> 'finalized' THEN
      RAISE EXCEPTION 'SOURCE_NOT_FINAL';
    END IF;
    IF v_sa IS NULL OR v_sb IS NULL THEN
      SELECT total_score INTO v_sa FROM public.clan_war_results
      WHERE war_id = v_m.source_id AND clan_id = v_m.participant_a;
      SELECT total_score INTO v_sb FROM public.clan_war_results
      WHERE war_id = v_m.source_id AND clan_id = v_m.participant_b;
      IF v_sa IS NULL OR v_sb IS NULL THEN
        RAISE EXCEPTION 'SOURCE_NOT_FINAL';
      END IF;
    END IF;
  ELSIF v_sa IS NULL OR v_sb IS NULL THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;

  SELECT d.winner, d.loser, d.tie_break INTO v_win, v_lose, v_tie
  FROM public.fn_tmatch_decide(
    v_m.tournament_id, v_m.participant_a, v_m.participant_b,
    v_sa, v_sb, COALESCE(p_metrics, '{}'::jsonb)) AS d;
  IF v_win NOT IN (v_m.participant_a, v_m.participant_b) THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;

  UPDATE public.tournament_matches SET
    status = 'finalized', score_a = v_sa, score_b = v_sb,
    metrics = COALESCE(p_metrics, '{}'::jsonb),
    winner_id = v_win, loser_id = v_lose, tie_break = v_tie,
    updated_at = now(), finalized_at = now()
  WHERE id = p_match;

  -- Advance the winner once into the parent slot.
  SELECT * INTO v_parent FROM public.tournament_matches
  WHERE child_match_a = p_match OR child_match_b = p_match;
  IF FOUND THEN
    IF v_parent.status = 'cancelled' THEN
      RAISE EXCEPTION 'INVALID_STATE';
    END IF;
    v_side := CASE WHEN v_parent.child_match_a = p_match
                   THEN 'a' ELSE 'b' END;
    v_occupant := CASE WHEN v_side = 'a' THEN v_parent.participant_a
                       ELSE v_parent.participant_b END;
    IF v_occupant IS NOT NULL AND v_occupant <> v_win THEN
      RAISE EXCEPTION 'DUPLICATE';
    END IF;
    -- No participant may appear twice within the same round.
    IF EXISTS (SELECT 1 FROM public.tournament_matches m
               WHERE m.round_id = v_parent.round_id AND m.id <> v_parent.id
                 AND (m.participant_a = v_win OR m.participant_b = v_win)) THEN
      RAISE EXCEPTION 'DUPLICATE';
    END IF;
    IF v_occupant IS NULL THEN
      IF v_side = 'a' THEN
        UPDATE public.tournament_matches SET participant_a = v_win
        WHERE id = v_parent.id;
      ELSE
        UPDATE public.tournament_matches SET participant_b = v_win
        WHERE id = v_parent.id;
      END IF;
      INSERT INTO public.tournament_match_participants
        (match_id, participant_id, side)
      VALUES (v_parent.id, v_win, v_side)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN v_win;
END;
$$;

-- Round transition: any pending match whose participants have both
-- arrived becomes ready (later rounds wait on empty slots, so they are
-- never activated early). When every match is finalized/bye/cancelled
-- the tournament moves live -> processing. Deterministic and
-- idempotent: replays change nothing.
CREATE OR REPLACE FUNCTION public.fn_advance_tournament(p_tournament uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.tournament_status;
  v_open int;
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  SELECT status INTO v_status FROM public.tournaments
  WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_status <> 'live' THEN
    RETURN v_status::text;
  END IF;
  SELECT min(r.round_no) INTO v_open
  FROM public.tournament_matches m
  JOIN public.tournament_rounds r ON r.id = m.round_id
  WHERE m.tournament_id = p_tournament
    AND m.status NOT IN ('finalized', 'bye', 'cancelled');
  IF v_open IS NULL THEN
    UPDATE public.tournaments SET status = 'processing', updated_at = now()
    WHERE id = p_tournament;
    PERFORM public.fn_log_tournament(
      p_tournament, 'live', 'processing', auth.uid());
    RETURN 'processing';
  END IF;
  UPDATE public.tournament_matches m SET status = 'ready', updated_at = now()
  FROM public.tournament_rounds r
  WHERE m.round_id = r.id AND m.tournament_id = p_tournament
    AND m.status = 'pending'
    AND m.participant_a IS NOT NULL AND m.participant_b IS NOT NULL;
  RETURN 'live';
END;
$$;

-- ---------------------------------------------------------------------------
-- Finalization: verify, place, freeze, pay once, snapshot, seal.
-- Re-finalize is an idempotent no-op returning already:true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finalize_tournament(p_tournament uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record;
  v_rounds int;
  v_final record;
  v_champion uuid;
  v_runner uuid;
  v_reward jsonb;
  v_key text;
  v_xp int;
  v_coins int;
  v_n int := 0;
  r record;
  m record;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  PERFORM public.fn_require_tournament_admin(p_tournament);
  IF v_t.status = 'finalized' THEN
    RETURN jsonb_build_object('tournament_id', p_tournament, 'already', true);
  END IF;
  IF v_t.status <> 'processing' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_matches
             WHERE tournament_id = p_tournament
               AND status NOT IN ('finalized', 'bye', 'cancelled')) THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT max(rd.round_no)::int INTO v_rounds
  FROM public.tournament_matches tm
  JOIN public.tournament_rounds rd ON rd.id = tm.round_id
  WHERE tm.tournament_id = p_tournament;
  SELECT tm.* INTO v_final
  FROM public.tournament_matches tm
  JOIN public.tournament_rounds rd ON rd.id = tm.round_id
  WHERE tm.tournament_id = p_tournament AND rd.round_no = v_rounds
  ORDER BY tm.slot LIMIT 1;
  IF v_final.id IS NULL OR v_final.winner_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  v_champion := v_final.winner_id;
  v_runner := v_final.loser_id;
  v_reward := v_t.reward_policy;

  -- Placements: champion 1, runner-up 2, semifinal losers tied 3,
  -- earlier exits tied at power(2, rounds - round) + 1.
  INSERT INTO public.tournament_results
    (tournament_id, participant_id, display_name, placement, details)
  VALUES (p_tournament, v_champion,
    COALESCE((SELECT display_name FROM public.tournament_participants
              WHERE tournament_id = p_tournament
                AND participant_id = v_champion), 'Player'),
    1, jsonb_build_object('round', v_rounds));
  IF v_runner IS NOT NULL THEN
    INSERT INTO public.tournament_results
      (tournament_id, participant_id, display_name, placement, details)
    VALUES (p_tournament, v_runner,
      COALESCE((SELECT display_name FROM public.tournament_participants
                WHERE tournament_id = p_tournament
                  AND participant_id = v_runner), 'Player'),
      2, jsonb_build_object('round', v_rounds))
    ON CONFLICT DO NOTHING;
  END IF;
  FOR r IN
    SELECT DISTINCT tm.loser_id AS pid,
           (SELECT round_no FROM public.tournament_rounds WHERE id = tm.round_id) AS rnd
    FROM public.tournament_matches tm
    WHERE tm.tournament_id = p_tournament AND tm.loser_id IS NOT NULL
      AND tm.loser_id NOT IN (v_champion, COALESCE(v_runner, '00000000-0000-0000-0000-000000000000'::uuid))
  LOOP
    INSERT INTO public.tournament_results
      (tournament_id, participant_id, display_name, placement, details)
    VALUES (p_tournament, r.pid,
      COALESCE((SELECT display_name FROM public.tournament_participants
                WHERE tournament_id = p_tournament
                  AND participant_id = r.pid), 'Player'),
      power(2, v_rounds - r.rnd)::int + 1,
      jsonb_build_object('round', r.rnd))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Rewards through the M5 ledgers, idempotent per key. Students are
  -- paid directly; clan placements pay every active roster member the
  -- per-member honor (clans hold no balances).
  FOR r IN SELECT * FROM public.tournament_results
           WHERE tournament_id = p_tournament
  LOOP
    IF r.placement = 1 THEN
      v_xp := COALESCE((v_reward ->> 'champion_xp')::int, 500);
      v_coins := COALESCE((v_reward ->> 'champion_coins')::int, 50);
    ELSIF r.placement = 2 THEN
      v_xp := COALESCE((v_reward ->> 'finalist_xp')::int, 300);
      v_coins := COALESCE((v_reward ->> 'finalist_coins')::int, 30);
    ELSIF r.placement = 3 THEN
      v_xp := COALESCE((v_reward ->> 'semi_xp')::int, 200);
      v_coins := COALESCE((v_reward ->> 'semi_coins')::int, 20);
    ELSE
      v_xp := COALESCE((v_reward ->> 'participation_xp')::int, 20);
      v_coins := COALESCE((v_reward ->> 'participation_coins')::int, 2);
    END IF;
    IF v_t.participant_type = 'student' THEN
      v_key := 'tournament:' || p_tournament::text || ':participant:'
        || r.participant_id::text || ':final:v1';
      INSERT INTO public.tournament_reward_events
        (key, tournament_id, participant_type, participant_id, xp, coins)
      VALUES (v_key, p_tournament, 'student', r.participant_id, v_xp, v_coins)
      ON CONFLICT (key) DO NOTHING;
      IF FOUND THEN
        INSERT INTO public.reward_events (key, user_id, attempt_id)
        VALUES (v_key, r.participant_id, NULL)
        ON CONFLICT (key) DO NOTHING;
        IF v_xp > 0 THEN
          INSERT INTO public.xp_ledger
            (user_id, amount, source, source_type, reference_id, reason,
             metadata, balance_after)
          SELECT r.participant_id, v_xp, 'tournament', 'tournament', v_key,
                 'tournament final reward',
                 jsonb_build_object('tournament_id', p_tournament,
                                    'placement', r.placement),
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
          SELECT r.participant_id, v_coins, 'tournament', 'tournament', v_key,
                 'tournament final reward',
                 jsonb_build_object('tournament_id', p_tournament,
                                    'placement', r.placement),
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
    ELSE
      IF r.placement = 1 THEN
        v_xp := COALESCE((v_reward ->> 'member_champion_xp')::int, 100);
        v_coins := COALESCE((v_reward ->> 'member_champion_coins')::int, 10);
      ELSIF r.placement = 2 THEN
        v_xp := COALESCE((v_reward ->> 'member_finalist_xp')::int, 60);
        v_coins := COALESCE((v_reward ->> 'member_finalist_coins')::int, 6);
      ELSIF r.placement = 3 THEN
        v_xp := COALESCE((v_reward ->> 'member_semi_xp')::int, 40);
        v_coins := COALESCE((v_reward ->> 'member_semi_coins')::int, 4);
      ELSE
        v_xp := COALESCE((v_reward ->> 'member_participation_xp')::int, 10);
        v_coins := COALESCE((v_reward ->> 'member_participation_coins')::int, 1);
      END IF;
      FOR m IN SELECT user_id FROM public.clan_members
               WHERE clan_id = r.participant_id AND status = 'active'
      LOOP
        v_key := 'tournament:' || p_tournament::text || ':clan:'
          || r.participant_id::text || ':member:' || m.user_id::text
          || ':final:v1';
        INSERT INTO public.tournament_reward_events
          (key, tournament_id, participant_type, participant_id, xp, coins)
        VALUES (v_key, p_tournament, 'student', m.user_id, v_xp, v_coins)
        ON CONFLICT (key) DO NOTHING;
        IF FOUND THEN
          INSERT INTO public.reward_events (key, user_id, attempt_id)
          VALUES (v_key, m.user_id, NULL)
          ON CONFLICT (key) DO NOTHING;
          IF v_xp > 0 THEN
            INSERT INTO public.xp_ledger
              (user_id, amount, source, source_type, reference_id, reason,
               metadata, balance_after)
            SELECT m.user_id, v_xp, 'tournament', 'tournament', v_key,
                   'tournament clan reward',
                   jsonb_build_object('tournament_id', p_tournament,
                                      'clan_id', r.participant_id,
                                      'placement', r.placement),
                   COALESCE(xp_total, 0) + v_xp
            FROM public.profiles WHERE id = m.user_id
            ON CONFLICT (user_id, source, reference_id) DO NOTHING;
            UPDATE public.profiles SET xp_total = xp_total + v_xp,
              current_level = (SELECT max(level) FROM public.levels
                               WHERE required_xp <= xp_total + v_xp)
            WHERE id = m.user_id AND EXISTS (
              SELECT 1 FROM public.xp_ledger
              WHERE user_id = m.user_id AND reference_id = v_key);
          END IF;
          IF v_coins > 0 THEN
            INSERT INTO public.coin_ledger
              (user_id, amount, source, source_type, reference_id, reason,
               metadata, balance_after)
            SELECT m.user_id, v_coins, 'tournament', 'tournament', v_key,
                   'tournament clan reward',
                   jsonb_build_object('tournament_id', p_tournament,
                                      'clan_id', r.participant_id,
                                      'placement', r.placement),
                   COALESCE(coin_balance, 0) + v_coins
            FROM public.profiles WHERE id = m.user_id
            ON CONFLICT (user_id, source, reference_id) DO NOTHING;
            UPDATE public.profiles SET coin_balance = coin_balance + v_coins
            WHERE id = m.user_id AND EXISTS (
              SELECT 1 FROM public.coin_ledger
              WHERE user_id = m.user_id AND reference_id = v_key);
          END IF;
          v_n := v_n + 1;
        END IF;
      END LOOP;
      -- Clan honor row (recorded, never ledgered) for the bracket itself.
      INSERT INTO public.tournament_reward_events
        (key, tournament_id, participant_type, participant_id, xp, coins)
      VALUES ('tournament:' || p_tournament::text || ':participant:'
        || r.participant_id::text || ':final:v1',
        p_tournament, 'clan', r.participant_id, 0, 0)
      ON CONFLICT (key) DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.tournaments SET version = version + 1 WHERE id = p_tournament;
  INSERT INTO public.tournament_versions (tournament_id, version, definition)
  SELECT p_tournament, version,
         to_jsonb(t.*) - 'created_at' - 'updated_at'
         || jsonb_build_object('standings',
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'participant_id', participant_id, 'placement', placement)
                 ORDER BY placement, participant_id), '[]'::jsonb)
               FROM public.tournament_results
               WHERE tournament_id = p_tournament))
  FROM public.tournaments t WHERE t.id = p_tournament;
  UPDATE public.tournaments
  SET status = 'finalized', finalized_at = now(), updated_at = now()
  WHERE id = p_tournament;
  PERFORM public.fn_log_tournament(
    p_tournament, 'processing', 'finalized', auth.uid());
  RETURN jsonb_build_object('tournament_id', p_tournament,
    'champion', v_champion, 'rewards', v_n);
END;
$$;

-- ---------------------------------------------------------------------------
-- Season integration: a finalized tournament contributes placement points
-- through the M13 event model (never direct season-point writes).
-- Idempotent per key; rerunnable.
-- ---------------------------------------------------------------------------
ALTER TABLE public.season_source_rules
  DROP CONSTRAINT IF EXISTS season_source_rules_source_type_check;
ALTER TABLE public.season_source_rules
  ADD CONSTRAINT season_source_rules_source_type_check
  CHECK (source_type IN (
    'COMPETITION', 'CLAN_WAR', 'CLAN_BOSS', 'MISSION', 'ACHIEVEMENT',
    'TOURNAMENT'));

CREATE OR REPLACE FUNCTION public.fn_sync_tournament_season(
  p_tournament uuid, p_season uuid
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t record;
  v_s record;
  v_cfg jsonb;
  v_pts int;
  v_key text;
  v_n int := 0;
  r record;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_t.status <> 'finalized' OR v_t.finalized_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT status, start_at, end_at, scoring_policy
    INTO v_s FROM public.seasons WHERE id = p_season;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_s.status NOT IN ('active', 'processing') THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.season_source_rules
                 WHERE season_id = p_season AND source_type = 'TOURNAMENT'
                   AND enabled) THEN
    RETURN 0;
  END IF;
  IF v_t.finalized_at < v_s.start_at OR v_t.finalized_at >= v_s.end_at THEN
    RETURN 0;
  END IF;
  v_cfg := v_s.scoring_policy;
  FOR r IN SELECT * FROM public.tournament_results
           WHERE tournament_id = p_tournament
  LOOP
    v_pts := CASE r.placement
      WHEN 1 THEN COALESCE((v_cfg -> 'TOURNAMENT' ->> 'first')::int, 100)
      WHEN 2 THEN COALESCE((v_cfg -> 'TOURNAMENT' ->> 'second')::int, 60)
      WHEN 3 THEN COALESCE((v_cfg -> 'TOURNAMENT' ->> 'third')::int, 40)
      ELSE COALESCE((v_cfg -> 'TOURNAMENT' ->> 'participation')::int, 10) END;
    IF NOT EXISTS (SELECT 1 FROM public.season_participants
                   WHERE season_id = p_season
                     AND participant_type = v_t.participant_type::text
                     AND participant_id = r.participant_id
                     AND eligible) THEN
      CONTINUE;
    END IF;
    v_key := 'season:' || p_season::text || ':source:TOURNAMENT:'
      || p_tournament::text || ':participant:' || r.participant_id::text
      || ':v1';
    INSERT INTO public.season_point_events
      (key, season_id, source_type, source_id,
       participant_type, participant_id, points, occurred_at)
    VALUES (v_key, p_season, 'TOURNAMENT', p_tournament,
      v_t.participant_type::text, r.participant_id, v_pts, v_t.finalized_at)
    ON CONFLICT (key) DO NOTHING;
    IF FOUND THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Scheduler hooks (no always-on process assumed): close due registrations
-- and start due tournaments. Manual triggers remain available for
-- recovery and testing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tournament_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.tournaments
           WHERE status = 'registration_open'
             AND registration_end IS NOT NULL
             AND registration_end <= now()
  LOOP
    UPDATE public.tournaments SET status = 'registration_closed',
      updated_at = now() WHERE id = r.id;
    PERFORM public.fn_log_tournament(
      r.id, 'registration_open', 'registration_closed', NULL);
    v_n := v_n + 1;
  END LOOP;
  FOR r IN SELECT id FROM public.tournaments
           WHERE status = 'seeded'
             AND start_at IS NOT NULL AND start_at <= now()
  LOOP
    UPDATE public.tournaments SET status = 'live', updated_at = now()
    WHERE id = r.id;
    UPDATE public.tournament_matches m SET status = 'ready',
      updated_at = now()
    FROM public.tournament_rounds rd
    WHERE m.round_id = rd.id AND m.tournament_id = r.id
      AND rd.round_no = 1 AND m.status = 'pending'
      AND m.participant_a IS NOT NULL AND m.participant_b IS NOT NULL;
    PERFORM public.fn_log_tournament(r.id, 'seeded', 'live', NULL);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Audited pre-live substitution only (roster is frozen after seeding;
-- no silent swaps, ever).
CREATE OR REPLACE FUNCTION public.fn_tournament_adjust(
  p_tournament uuid, p_scope text, p_ref uuid,
  p_patch jsonb, p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.tournament_status;
  v_out uuid;
  v_in uuid;
  v_m record;
  v_seed int;
BEGIN
  PERFORM public.fn_require_tournament_admin(p_tournament);
  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF p_scope <> 'substitution' THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF v_status <> 'seeded' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF p_reason IS NULL OR char_length(p_reason) < 4 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  v_out := NULLIF(p_patch ->> 'out', '')::uuid;
  v_in := NULLIF(p_patch ->> 'in', '')::uuid;
  IF v_out IS NULL OR v_in IS NULL OR v_out = v_in THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  SELECT * INTO v_m FROM public.tournament_matches
  WHERE id = p_ref AND tournament_id = p_tournament;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_m.status NOT IN ('pending', 'ready') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF v_out NOT IN (v_m.participant_a, v_m.participant_b) THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_participants
                 WHERE tournament_id = p_tournament
                   AND participant_id = v_in
                   AND status IN ('active', 'withdrawn')) THEN
    RAISE EXCEPTION 'INELIGIBLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_seeding
             WHERE tournament_id = p_tournament
               AND participant_id = v_in) THEN
    RAISE EXCEPTION 'DUPLICATE';
  END IF;
  SELECT seed INTO v_seed FROM public.tournament_seeding
  WHERE tournament_id = p_tournament AND participant_id = v_out;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  DELETE FROM public.tournament_seeding
  WHERE tournament_id = p_tournament AND participant_id = v_out;
  INSERT INTO public.tournament_seeding
    (tournament_id, participant_id, seed, source, snapshot_ref)
  VALUES (p_tournament, v_in, v_seed, 'admin_substitution',
    jsonb_build_object('replaces', v_out, 'reason', p_reason,
                       'at', now()));
  IF v_m.participant_a = v_out THEN
    UPDATE public.tournament_matches SET participant_a = v_in
    WHERE id = p_ref;
  ELSE
    UPDATE public.tournament_matches SET participant_b = v_in
    WHERE id = p_ref;
  END IF;
  DELETE FROM public.tournament_match_participants
  WHERE match_id = p_ref AND participant_id = v_out;
  INSERT INTO public.tournament_match_participants
    (match_id, participant_id, side)
  VALUES (p_ref, v_in,
    CASE WHEN v_m.participant_a = v_out THEN 'a' ELSE 'b' END);
  IF v_m.winner_id = v_out THEN
    UPDATE public.tournament_matches SET winner_id = v_in WHERE id = p_ref;
  END IF;
  UPDATE public.tournament_participants SET status = 'withdrawn'
  WHERE tournament_id = p_tournament AND participant_id = v_out;
  UPDATE public.tournament_participants SET status = 'active'
  WHERE tournament_id = p_tournament AND participant_id = v_in;
  INSERT INTO public.tournament_adjustments
    (tournament_id, scope, ref_id, old_value, new_value, reason, created_by)
  VALUES (p_tournament, 'substitution', p_ref,
    jsonb_build_object('out', v_out, 'seed', v_seed),
    COALESCE(p_patch, '{}'::jsonb), p_reason, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.fn_log_tournament(uuid, public.tournament_status, public.tournament_status, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_log_tournament(uuid, public.tournament_status, public.tournament_status, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_require_tournament_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_require_tournament_admin(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_create_tournament(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_tournament(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_update_tournament_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_tournament_draft(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_publish_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_publish_tournament(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_close_registration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_close_registration(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cancel_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancel_tournament(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_register_tournament(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_tournament(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_withdraw_tournament(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_withdraw_tournament(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_seed_tournament(uuid, text, uuid[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_seed_tournament(uuid, text, uuid[], int) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_start_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_start_tournament(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_open_tmatch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_open_tmatch(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_tmatch_decide(uuid, uuid, uuid, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tmatch_decide(uuid, uuid, uuid, numeric, numeric, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_finalize_tmatch(uuid, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_tmatch(uuid, numeric, numeric, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_advance_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_tournament(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_finalize_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_tournament(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_tournament_season(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_tournament_season(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_tournament_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tournament_sweep() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_tournament_adjust(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tournament_adjust(uuid, text, uuid, jsonb, text) TO authenticated;
