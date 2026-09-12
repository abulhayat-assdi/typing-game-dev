-- M12 boss operations: admin definitions, instance lifecycle, atomic
-- damage with row locking, phase transitions, idempotent M5 rewards.
-- Students never write boss state directly (no policies for writes).

-- ---------------------------------------------------------------------------
-- Admin: definitions (versioned), phases, status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_boss(p_def jsonb)
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
     OR (p_def ->> 'max_hp')::bigint IS NULL
     OR (p_def ->> 'max_hp')::bigint <= 0 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.boss_definitions (
    slug, name, description, lore, difficulty, world_id, max_hp,
    rules, scoring_profile, reward_profile, eligible,
    starts_at, ends_at, preview_key, banner_key, art_key)
  VALUES (
    p_def ->> 'slug', p_def ->> 'name', COALESCE(p_def ->> 'description', ''),
    COALESCE(p_def ->> 'lore', ''),
    COALESCE(p_def ->> 'difficulty', 'normal'), p_def ->> 'world_id',
    (p_def ->> 'max_hp')::bigint,
    COALESCE(p_def -> 'rules', '{}'::jsonb),
    COALESCE(p_def -> 'scoring_profile',
      '{"formula": "score_x_mult", "multiplier": 1}'::jsonb),
    COALESCE(p_def -> 'reward_profile',
      '{"participation_xp": 20, "participation_coins": 2, "defeat_xp": 100, "defeat_coins": 10, "apply_on_expire": true}'::jsonb),
    COALESCE(p_def -> 'eligible', '{"min_level": 1}'::jsonb),
    (p_def ->> 'starts_at')::timestamptz, (p_def ->> 'ends_at')::timestamptz,
    p_def ->> 'preview_key', p_def ->> 'banner_key', p_def ->> 'art_key')
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_SLUG';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_boss_draft(
  p_boss uuid, p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.boss_definitions
                 WHERE id = p_boss AND status = 'draft') THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  UPDATE public.boss_definitions SET
    name = COALESCE(NULLIF(p_patch ->> 'name', ''), name),
    description = COALESCE(p_patch ->> 'description', description),
    lore = COALESCE(p_patch ->> 'lore', lore),
    difficulty = COALESCE(p_patch ->> 'difficulty', difficulty),
    max_hp = COALESCE((p_patch ->> 'max_hp')::bigint, max_hp),
    rules = COALESCE(p_patch -> 'rules', rules),
    scoring_profile = COALESCE(p_patch -> 'scoring_profile', scoring_profile),
    reward_profile = COALESCE(p_patch -> 'reward_profile', reward_profile),
    eligible = COALESCE(p_patch -> 'eligible', eligible),
    starts_at = COALESCE((p_patch ->> 'starts_at')::timestamptz, starts_at),
    ends_at = COALESCE((p_patch ->> 'ends_at')::timestamptz, ends_at),
    version = version + 1,
    updated_at = now()
  WHERE id = p_boss;
  INSERT INTO public.boss_versions (boss_id, version, definition)
  SELECT p_boss, version,
    to_jsonb(d.*) - 'created_at' - 'updated_at'
  FROM public.boss_definitions d WHERE d.id = p_boss;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_add_boss_phase(
  p_boss uuid, p_position int, p_name text, p_hp_from bigint, p_hp_to bigint,
  p_constraints jsonb, p_multiplier numeric, p_rules jsonb
)
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
  IF NOT EXISTS (SELECT 1 FROM public.boss_definitions
                 WHERE id = p_boss AND status = 'draft') THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  IF p_hp_from IS NULL OR p_hp_to IS NULL OR p_hp_from <= p_hp_to THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.boss_phases
    (boss_id, position, name, hp_from, hp_to, game_constraints,
     damage_multiplier, rules)
  VALUES (p_boss, p_position, COALESCE(p_name, ''),
    p_hp_from, p_hp_to, COALESCE(p_constraints, '{}'::jsonb),
    COALESCE(p_multiplier, 1), COALESCE(p_rules, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_POSITION';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_boss_status(
  p_boss uuid, p_status public.boss_status
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.boss_definitions SET status = p_status, updated_at = now()
  WHERE id = p_boss;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Instances: schedule, activate (snapshot + pool), damage, finalize.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_boss_instance(
  p_boss uuid, p_clan uuid, p_start timestamptz, p_end timestamptz,
  p_attempts_per_member int DEFAULT 10
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_max bigint;
BEGIN
  IF NOT public.fn_can_manage_clan(p_clan)
    AND NOT public.fn_is_mission_admin()
    AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT max_hp INTO v_max FROM public.boss_definitions
  WHERE id = p_boss AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOSS_INACTIVE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clans
                 WHERE id = p_clan AND status = 'active') THEN
    RAISE EXCEPTION 'CLAN_INACTIVE';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.boss_instances
    (boss_id, clan_id, status, start_at, end_at,
     initial_hp, current_hp, attempts_per_member)
  VALUES (p_boss, p_clan, 'scheduled', p_start, p_end,
    v_max, v_max, GREATEST(COALESCE(p_attempts_per_member, 10), 1))
  ON CONFLICT (boss_id, clan_id, start_at) DO NOTHING
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    SELECT id INTO v_id FROM public.boss_instances
    WHERE boss_id = p_boss AND clan_id = p_clan AND start_at = p_start;
  END IF;
  RETURN v_id;
END;
$$;

-- Activate: snapshot eligible members, resolve the game pool from all
-- phases' constraints (phase rules still filter per-submit).
CREATE OR REPLACE FUNCTION public.fn_activate_boss_instance(p_instance uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst record;
  v_min int;
  v_slug text;
BEGIN
  SELECT * INTO v_inst FROM public.boss_instances WHERE id = p_instance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT public.fn_can_manage_clan(v_inst.clan_id)
    AND NOT public.fn_is_mission_admin()
    AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_inst.status <> 'scheduled' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT COALESCE((eligible ->> 'min_level')::int, 1) INTO v_min
  FROM public.boss_definitions WHERE id = v_inst.boss_id;
  INSERT INTO public.boss_participants
    (instance_id, user_id, eligible, eligibility_snapshot)
  SELECT p_instance, m.user_id, true,
         jsonb_build_object('level', COALESCE(p.current_level, 1),
                            'clan_id', m.clan_id)
  FROM public.clan_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.clan_id = v_inst.clan_id AND m.status = 'active'
    AND COALESCE(p.current_level, 1) >= v_min
  ON CONFLICT (instance_id, user_id) DO NOTHING;
  FOR v_slug IN
    SELECT DISTINCT x FROM public.boss_phases ph,
      jsonb_array_elements_text(
        COALESCE(ph.game_constraints -> 'games', '[]'::jsonb)) AS x
    WHERE ph.boss_id = v_inst.boss_id
  LOOP
    INSERT INTO public.boss_games (instance_id, game_id)
    SELECT p_instance, g.id FROM public.games g
    WHERE g.slug = v_slug AND g.is_active
    ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.boss_instances
  SET status = 'active', current_phase = 0 WHERE id = p_instance;
  PERFORM public.fn_log_clan(v_inst.clan_id, 'boss_started', auth.uid(),
    jsonb_build_object('instance_id', p_instance));
END;
$$;

-- Finalize: lock state, pay participation (+ defeat bonus on kills),
-- seal immutable results. Idempotent.
CREATE OR REPLACE FUNCTION public.fn_finalize_boss(p_instance uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst record;
  v_def record;
  v_outcome text;
  v_total bigint;
  v_count int;
  v_top uuid;
  v_top_dmg bigint;
  v_apply_expire boolean;
  v_uid uuid;
  v_key text;
  v_xp int;
  v_coins int;
BEGIN
  SELECT * INTO v_inst FROM public.boss_instances
  WHERE id = p_instance FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_inst.status = 'finalized' THEN
    RETURN jsonb_build_object('instance_id', p_instance, 'already', true);
  END IF;
  IF v_inst.status NOT IN ('defeated', 'expired') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT * INTO v_def FROM public.boss_definitions
  WHERE id = v_inst.boss_id;
  v_outcome := CASE WHEN v_inst.status = 'defeated' THEN 'defeated' ELSE 'expired' END;
  v_apply_expire := COALESCE(
    (v_def.reward_profile ->> 'apply_on_expire')::boolean, true);
  UPDATE public.boss_instances SET status = 'processing'
  WHERE id = p_instance;
  SELECT COALESCE(sum(damage), 0), count(DISTINCT user_id)
    INTO v_total, v_count
  FROM public.boss_participants WHERE instance_id = p_instance AND damage > 0;
  SELECT user_id, damage INTO v_top, v_top_dmg
  FROM public.boss_participants WHERE instance_id = p_instance
  ORDER BY damage DESC LIMIT 1;
  INSERT INTO public.boss_results
    (instance_id, total_damage, contributors, top_user_id, top_damage, outcome)
  VALUES (p_instance, v_total, v_count, v_top,
    COALESCE(v_top_dmg, 0), v_outcome)
  ON CONFLICT (instance_id) DO NOTHING;
  FOR v_uid IN SELECT user_id FROM public.boss_participants
               WHERE instance_id = p_instance AND attempts_used > 0
  LOOP
    -- Participation always (or per apply_on_expire on expiry).
    IF v_outcome = 'defeated' OR v_apply_expire THEN
      v_key := 'boss:' || p_instance::text || ':member:' || v_uid::text
        || ':participation:v1';
      v_xp := COALESCE((v_def.reward_profile ->> 'participation_xp')::int, 0);
      v_coins := COALESCE((v_def.reward_profile ->> 'participation_coins')::int, 0);
      INSERT INTO public.boss_reward_events
        (key, instance_id, user_id, kind, xp, coins)
      VALUES (v_key, p_instance, v_uid, 'participation', v_xp, v_coins)
      ON CONFLICT (key) DO NOTHING;
      IF FOUND THEN
        PERFORM public.fn_pay_boss_reward(
          p_instance, v_uid, v_key, 'boss participation', v_xp, v_coins);
      END IF;
    END IF;
    -- Defeat bonus only on kills, only to damage dealers.
    IF v_outcome = 'defeated'
       AND EXISTS (SELECT 1 FROM public.boss_participants
                   WHERE instance_id = p_instance AND user_id = v_uid
                     AND damage > 0) THEN
      v_key := 'boss:' || p_instance::text || ':member:' || v_uid::text
        || ':defeat:v1';
      v_xp := COALESCE((v_def.reward_profile ->> 'defeat_xp')::int, 0);
      v_coins := COALESCE((v_def.reward_profile ->> 'defeat_coins')::int, 0);
      INSERT INTO public.boss_reward_events
        (key, instance_id, user_id, kind, xp, coins)
      VALUES (v_key, p_instance, v_uid, 'defeat', v_xp, v_coins)
      ON CONFLICT (key) DO NOTHING;
      IF FOUND THEN
        PERFORM public.fn_pay_boss_reward(
          p_instance, v_uid, v_key, 'boss defeat', v_xp, v_coins);
      END IF;
    END IF;
  END LOOP;
  UPDATE public.boss_instances
  SET status = 'finalized', finalized_at = now() WHERE id = p_instance;
  PERFORM public.fn_log_clan(v_inst.clan_id, 'boss_finalized', auth.uid(),
    jsonb_build_object('instance_id', p_instance, 'outcome', v_outcome,
      'total_damage', v_total));
  RETURN jsonb_build_object('instance_id', p_instance, 'outcome', v_outcome,
    'total_damage', v_total, 'contributors', v_count);
END;
$$;

-- Single ledger writer for boss rewards (idempotent keys).
CREATE OR REPLACE FUNCTION public.fn_pay_boss_reward(
  p_instance uuid, p_user uuid, p_key text, p_reason text,
  p_xp int, p_coins int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reward_events (key, user_id, attempt_id)
  VALUES (p_key, p_user, NULL)
  ON CONFLICT (key) DO NOTHING;
  IF p_xp > 0 THEN
    INSERT INTO public.xp_ledger
      (user_id, amount, source, source_type, reference_id, reason,
       metadata, balance_after)
    SELECT p_user, p_xp, 'boss', 'boss', p_key, p_reason,
           jsonb_build_object('instance_id', p_instance),
           COALESCE(xp_total, 0) + p_xp
    FROM public.profiles WHERE id = p_user
    ON CONFLICT (user_id, source, reference_id) DO NOTHING;
    UPDATE public.profiles SET xp_total = xp_total + p_xp,
      current_level = (SELECT max(level) FROM public.levels
                       WHERE required_xp <= xp_total + p_xp)
    WHERE id = p_user AND EXISTS (
      SELECT 1 FROM public.xp_ledger
      WHERE user_id = p_user AND reference_id = p_key);
  END IF;
  IF p_coins > 0 THEN
    INSERT INTO public.coin_ledger
      (user_id, amount, source, source_type, reference_id, reason,
       metadata, balance_after)
    SELECT p_user, p_coins, 'boss', 'boss', p_key, p_reason,
           jsonb_build_object('instance_id', p_instance),
           COALESCE(coin_balance, 0) + p_coins
    FROM public.profiles WHERE id = p_user
    ON CONFLICT (user_id, source, reference_id) DO NOTHING;
    UPDATE public.profiles SET coin_balance = coin_balance + p_coins
    WHERE id = p_user AND EXISTS (
      SELECT 1 FROM public.coin_ledger
      WHERE user_id = p_user AND reference_id = p_key);
  END IF;
END;
$$;

-- Scheduler sweep: activate due, expire overdue, finalize the settled.
-- Production cron/Workers call this; admins may trigger per instance via
-- fn_advance_boss below. Manual flow is fully supported.
CREATE OR REPLACE FUNCTION public.fn_boss_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.boss_instances WHERE status = 'scheduled'
  LOOP
    BEGIN
      PERFORM public.fn_activate_boss_sweep(r.id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  FOR r IN SELECT id FROM public.boss_instances
           WHERE status = 'active' AND end_at <= now()
  LOOP
    UPDATE public.boss_instances SET status = 'expired' WHERE id = r.id;
    PERFORM public.fn_finalize_boss(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Activation variant without the manager gate, for the sweep only.
CREATE OR REPLACE FUNCTION public.fn_activate_boss_sweep(p_instance uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst record;
  v_min int;
  v_slug text;
BEGIN
  SELECT * INTO v_inst FROM public.boss_instances WHERE id = p_instance;
  IF NOT FOUND OR v_inst.status <> 'scheduled' THEN
    RETURN;
  END IF;
  IF v_inst.start_at IS NULL OR v_inst.start_at > now() THEN
    RETURN;
  END IF;
  SELECT COALESCE((eligible ->> 'min_level')::int, 1) INTO v_min
  FROM public.boss_definitions WHERE id = v_inst.boss_id;
  INSERT INTO public.boss_participants
    (instance_id, user_id, eligible, eligibility_snapshot)
  SELECT p_instance, m.user_id, true,
         jsonb_build_object('level', COALESCE(p.current_level, 1),
                            'clan_id', m.clan_id)
  FROM public.clan_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.clan_id = v_inst.clan_id AND m.status = 'active'
    AND COALESCE(p.current_level, 1) >= v_min
  ON CONFLICT (instance_id, user_id) DO NOTHING;
  FOR v_slug IN
    SELECT DISTINCT x FROM public.boss_phases ph,
      jsonb_array_elements_text(
        COALESCE(ph.game_constraints -> 'games', '[]'::jsonb)) AS x
    WHERE ph.boss_id = v_inst.boss_id
  LOOP
    INSERT INTO public.boss_games (instance_id, game_id)
    SELECT p_instance, g.id FROM public.games g
    WHERE g.slug = v_slug AND g.is_active
    ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.boss_instances
  SET status = 'active', current_phase = 0 WHERE id = p_instance;
  PERFORM public.fn_log_clan(v_inst.clan_id, 'boss_started', NULL,
    jsonb_build_object('instance_id', p_instance));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_advance_boss(p_instance uuid)
RETURNS public.boss_instance_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst record;
BEGIN
  SELECT * INTO v_inst FROM public.boss_instances WHERE id = p_instance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT public.fn_can_manage_clan(v_inst.clan_id)
    AND NOT public.fn_is_mission_admin()
    AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_inst.status = 'scheduled' THEN
    PERFORM public.fn_activate_boss_sweep(p_instance);
  ELSIF v_inst.status = 'active' AND v_inst.end_at <= now() THEN
    UPDATE public.boss_instances SET status = 'expired'
    WHERE id = p_instance;
    PERFORM public.fn_finalize_boss(p_instance);
  END IF;
  SELECT status INTO v_inst.status FROM public.boss_instances
  WHERE id = p_instance;
  RETURN v_inst.status;
END;
$$;

-- Privacy-safe state: boss, HP/phase, own contribution, top contributors,
-- recent damage feed (display names only).
CREATE OR REPLACE FUNCTION public.fn_boss_state(p_instance uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_inst record;
  v_def record;
  v_out jsonb;
BEGIN
  SELECT * INTO v_inst FROM public.boss_instances WHERE id = p_instance;
  IF NOT FOUND OR NOT public.fn_is_boss_viewer(p_instance) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_def FROM public.boss_definitions WHERE id = v_inst.boss_id;
  SELECT jsonb_build_object(
    'instance', jsonb_build_object(
      'id', v_inst.id, 'status', v_inst.status,
      'start_at', v_inst.start_at, 'end_at', v_inst.end_at,
      'initial_hp', v_inst.initial_hp, 'current_hp', v_inst.current_hp,
      'current_phase', v_inst.current_phase,
      'attempts_per_member', v_inst.attempts_per_member,
      'defeated_at', v_inst.defeated_at),
    'boss', jsonb_build_object(
      'slug', v_def.slug, 'name', v_def.name, 'lore', v_def.lore,
      'difficulty', v_def.difficulty, 'max_hp', v_def.max_hp,
      'art_key', v_def.art_key,
      'reward_profile', v_def.reward_profile),
    'phases', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('position', position, 'name', name,
          'hp_from', hp_from, 'hp_to', hp_to,
          'damage_multiplier', damage_multiplier)
        ORDER BY position), '[]'::jsonb)
      FROM public.boss_phases WHERE boss_id = v_inst.boss_id),
    'mine', (SELECT jsonb_build_object('damage', damage,
        'attempts_used', attempts_used)
      FROM public.boss_participants
      WHERE instance_id = p_instance AND user_id = v_me),
    'top', (SELECT COALESCE(jsonb_agg(t.* ORDER BY t.damage DESC), '[]'::jsonb)
      FROM (SELECT COALESCE(NULLIF(p.full_name, ''), 'Player') AS name,
                   bp.damage, (bp.user_id = v_me) AS is_me
            FROM public.boss_participants bp
            JOIN public.profiles p ON p.id = bp.user_id
            WHERE bp.instance_id = p_instance AND bp.damage > 0
            ORDER BY bp.damage DESC LIMIT 10) t),
    'feed', (SELECT COALESCE(jsonb_agg(f.* ORDER BY f.created_at DESC), '[]'::jsonb)
      FROM (SELECT e.kind, e.summary, e.created_at
            FROM public.clan_activity e
            WHERE e.clan_id = v_inst.clan_id
              AND (e.summary ->> 'instance_id') = p_instance::text
            ORDER BY e.created_at DESC LIMIT 20) f)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed bosses (reusable engine only; no per-boss code anywhere).
-- ---------------------------------------------------------------------------
INSERT INTO public.boss_definitions
  (slug, name, description, lore, difficulty, max_hp, status,
   scoring_profile, reward_profile)
VALUES
  ('stone-titan', 'Stone Titan', 'A slow mountain of rock.',
   'The mountain woke up.', 'easy', 5000, 'active',
   '{"formula": "score_x_mult", "multiplier": 1}'::jsonb,
   '{"participation_xp": 20, "participation_coins": 2, "defeat_xp": 60, "defeat_coins": 6, "apply_on_expire": true}'::jsonb),
  ('word-kraken', 'Word Kraken', 'Tentacles of tangled words.',
   'It drags slow typists down.', 'normal', 20000, 'active',
   '{"formula": "score_x_mult", "multiplier": 1}'::jsonb,
   '{"participation_xp": 25, "participation_coins": 3, "defeat_xp": 100, "defeat_coins": 10, "apply_on_expire": true}'::jsonb),
  ('sentence-dragon', 'Sentence Dragon', 'Breathes long sentences.',
   'Only the precise survive its fire.', 'hard', 60000, 'active',
   '{"formula": "score_x_mult", "multiplier": 1}'::jsonb,
   '{"participation_xp": 30, "participation_coins": 3, "defeat_xp": 150, "defeat_coins": 15, "apply_on_expire": true}'::jsonb),
  ('speed-phantom', 'Speed Phantom', 'A blur that feeds on pace.',
   'Catch it if your fingers can.', 'normal', 15000, 'active',
   '{"formula": "wpm_x_acc", "multiplier": 2}'::jsonb,
   '{"participation_xp": 25, "participation_coins": 3, "defeat_xp": 100, "defeat_coins": 10, "apply_on_expire": true}'::jsonb),
  ('error-king', 'Error King', 'Every mistake makes it stronger.',
   'Type clean or fall.', 'nightmare', 100000, 'active',
   '{"formula": "score_x_mult", "multiplier": 2}'::jsonb,
   '{"participation_xp": 40, "participation_coins": 4, "defeat_xp": 250, "defeat_coins": 25, "apply_on_expire": false}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.boss_phases
  (boss_id, position, name, hp_from, hp_to, damage_multiplier, rules)
SELECT d.id, v.position, v.name, v.hp_from, v.hp_to, v.mult, v.rules::jsonb
FROM public.boss_definitions d
JOIN (VALUES
  ('stone-titan', 0, 'Awakened', 5000, 0, 1, '{}'),
  ('word-kraken', 0, 'Surface', 20000, 8000, 1, '{}'),
  ('word-kraken', 1, 'Deep Water', 8000, 0, 1.5, '{"min_accuracy": 85}'),
  ('sentence-dragon', 0, 'Ember', 60000, 30000, 1, '{}'),
  ('sentence-dragon', 1, 'Flame', 30000, 10000, 1.25, '{"min_accuracy": 88}'),
  ('sentence-dragon', 2, 'Inferno', 10000, 0, 1.5, '{"min_accuracy": 92}'),
  ('speed-phantom', 0, 'Blur', 15000, 0, 1, '{}'),
  ('error-king', 0, 'Mocking', 100000, 40000, 1, '{}'),
  ('error-king', 1, 'Furious', 40000, 0, 2, '{"min_accuracy": 90}')
) AS v(slug, position, name, hp_from, hp_to, mult, rules)
  ON v.slug = d.slug
ON CONFLICT (boss_id, position) DO NOTHING;

-- Data-driven damage from server-computed result metrics (never client
-- numbers, never raw XP): score×multiplier or wpm×accuracy×multiplier.
CREATE OR REPLACE FUNCTION public.fn_boss_damage_for(
  p_profile jsonb, p_score numeric, p_wpm numeric, p_acc numeric,
  p_phase_mult numeric
)
RETURNS bigint
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_formula text := COALESCE(p_profile ->> 'formula', 'score_x_mult');
  v_mult numeric := GREATEST(COALESCE((p_profile ->> 'multiplier')::numeric, 1), 0);
  v_accf numeric := GREATEST(COALESCE((p_profile ->> 'accuracy_factor')::numeric, 1), 0);
  v_base numeric := 0;
BEGIN
  IF v_formula = 'wpm_x_acc' THEN
    v_base := COALESCE(p_wpm, 0) * (COALESCE(p_acc, 0) / 100) * v_mult * v_accf;
  ELSE
    v_base := COALESCE(p_score, 0) * v_mult;
  END IF;
  RETURN GREATEST(floor(v_base * COALESCE(p_phase_mult, 1))::bigint, 0);
END;
$$;

-- Atomic submit: instance row lock serializes concurrent members, so no
-- lost updates, no negative HP, single phase transition per crossing.
CREATE OR REPLACE FUNCTION public.fn_submit_boss_attempt(
  p_instance uuid, p_attempt uuid
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_inst record;
  v_def record;
  v_part record;
  v_att record;
  v_res record;
  v_phase record;
  v_games text[];
  v_worlds text[];
  v_key text;
  v_damage bigint;
  v_new_hp bigint;
  v_new_phase int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  -- Lock first: concurrent submissions serialize here.
  SELECT * INTO v_inst FROM public.boss_instances
  WHERE id = p_instance FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_inst.status <> 'active' THEN
    RAISE EXCEPTION 'NOT_ACTIVE';
  END IF;
  IF now() < v_inst.start_at OR now() >= v_inst.end_at THEN
    RAISE EXCEPTION 'OUTSIDE_WINDOW';
  END IF;
  SELECT * INTO v_part FROM public.boss_participants
  WHERE instance_id = p_instance AND user_id = v_me;
  IF NOT FOUND OR NOT v_part.eligible THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;
  IF v_part.attempts_used >= v_inst.attempts_per_member THEN
    RAISE EXCEPTION 'ATTEMPT_LIMIT';
  END IF;
  SELECT * INTO v_att FROM public.game_attempts WHERE id = p_attempt;
  IF NOT FOUND OR v_att.user_id <> v_me THEN
    RAISE EXCEPTION 'ATTEMPT_FORBIDDEN';
  END IF;
  IF v_att.status <> 'validated' THEN
    RAISE EXCEPTION 'NOT_VALIDATED';
  END IF;
  SELECT * INTO v_def FROM public.boss_definitions
  WHERE id = v_inst.boss_id;
  -- Current phase rules (band containing current HP, else closest below).
  SELECT * INTO v_phase FROM public.boss_phases
  WHERE boss_id = v_inst.boss_id
    AND v_inst.current_hp > hp_to AND v_inst.current_hp <= hp_from
  ORDER BY position LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_phase FROM public.boss_phases
    WHERE boss_id = v_inst.boss_id ORDER BY position LIMIT 1;
  END IF;
  IF FOUND THEN
    SELECT COALESCE(array_agg(x), '{}') INTO v_games
    FROM jsonb_array_elements_text(
      COALESCE(v_phase.game_constraints -> 'games', '[]'::jsonb)) AS x;
    SELECT COALESCE(array_agg(x), '{}') INTO v_worlds
    FROM jsonb_array_elements_text(
      COALESCE(v_phase.game_constraints -> 'worlds', '[]'::jsonb)) AS x;
    IF v_games <> '{}' AND NOT EXISTS (
        SELECT 1 FROM public.games g
        WHERE g.id = v_att.game_id AND g.slug = ANY (v_games)) THEN
      RAISE EXCEPTION 'GAME_NOT_ALLOWED';
    END IF;
    IF v_worlds <> '{}' AND NOT EXISTS (
        SELECT 1 FROM public.games g
        WHERE g.id = v_att.game_id AND g.world_id = ANY (v_worlds)) THEN
      RAISE EXCEPTION 'GAME_NOT_ALLOWED';
    END IF;
    IF (v_phase.rules ->> 'min_accuracy')::numeric IS NOT NULL THEN
      SELECT * INTO v_res FROM public.attempt_results
      WHERE attempt_id = p_attempt;
      IF NOT FOUND OR NOT v_res.is_valid
         OR v_res.accuracy < (v_phase.rules ->> 'min_accuracy')::numeric THEN
        RAISE EXCEPTION 'BELOW_PHASE_BAR';
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_res FROM public.attempt_results WHERE attempt_id = p_attempt;
  IF NOT FOUND OR NOT v_res.is_valid THEN
    RAISE EXCEPTION 'NOT_VALIDATED';
  END IF;
  v_key := 'boss:' || p_instance::text || ':attempt:' || p_attempt::text
    || ':damage:v1';
  INSERT INTO public.boss_damage_events
    (key, instance_id, user_id, attempt_id, damage, phase)
  VALUES (v_key, p_instance, v_me, p_attempt, 0, v_inst.current_phase)
  ON CONFLICT (key) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DUPLICATE';
  END IF;
  v_damage := public.fn_boss_damage_for(
    v_def.scoring_profile, v_res.score, v_res.effective_wpm,
    v_res.accuracy, COALESCE(v_phase.damage_multiplier, 1));
  UPDATE public.boss_damage_events SET damage = v_damage, phase = v_inst.current_phase
  WHERE key = v_key;
  INSERT INTO public.boss_attempts
    (instance_id, user_id, attempt_id, damage, phase)
  VALUES (p_instance, v_me, p_attempt, v_damage, v_inst.current_phase)
  ON CONFLICT (attempt_id) DO NOTHING;
  v_new_hp := GREATEST(v_inst.current_hp - v_damage, 0);
  -- Phase from the new HP (server authoritative).
  SELECT COALESCE(max(position), v_inst.current_phase) INTO v_new_phase
  FROM public.boss_phases
  WHERE boss_id = v_inst.boss_id AND v_new_hp <= hp_from;
  IF v_new_phase IS NULL THEN
    v_new_phase := v_inst.current_phase;
  END IF;
  UPDATE public.boss_instances
  SET current_hp = v_new_hp, current_phase = v_new_phase,
      status = CASE WHEN v_new_hp = 0 THEN 'defeated'::public.boss_instance_status
                    ELSE status END,
      defeated_at = CASE WHEN v_new_hp = 0 THEN now() ELSE defeated_at END
  WHERE id = p_instance;
  IF v_new_phase <> v_inst.current_phase THEN
    INSERT INTO public.boss_phase_events
      (instance_id, from_phase, to_phase, hp_remaining)
    VALUES (p_instance, v_inst.current_phase, v_new_phase, v_new_hp);
    PERFORM public.fn_log_clan(v_inst.clan_id, 'boss_phase', v_me,
      jsonb_build_object('instance_id', p_instance,
        'from_phase', v_inst.current_phase, 'to_phase', v_new_phase));
  END IF;
  IF v_new_hp = 0 AND v_inst.current_hp > 0 THEN
    PERFORM public.fn_log_clan(v_inst.clan_id, 'boss_defeated', v_me,
      jsonb_build_object('instance_id', p_instance));
  END IF;
  UPDATE public.boss_participants
  SET damage = damage + v_damage, attempts_used = attempts_used + 1
  WHERE instance_id = p_instance AND user_id = v_me;
  PERFORM public.fn_log_clan(v_inst.clan_id, 'boss_damage', v_me,
    jsonb_build_object('instance_id', p_instance, 'damage', v_damage));
  RETURN v_damage;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_boss(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_boss(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_update_boss_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_boss_draft(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_add_boss_phase(uuid, int, text, bigint, bigint, jsonb, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_add_boss_phase(uuid, int, text, bigint, bigint, jsonb, numeric, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_boss_status(uuid, public.boss_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_boss_status(uuid, public.boss_status) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_create_boss_instance(uuid, uuid, timestamptz, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_boss_instance(uuid, uuid, timestamptz, timestamptz, int) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_activate_boss_instance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_boss_instance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_submit_boss_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_boss_attempt(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_finalize_boss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_boss(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_advance_boss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_boss(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_boss_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_boss_sweep() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_boss_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_boss_state(uuid) TO authenticated;
