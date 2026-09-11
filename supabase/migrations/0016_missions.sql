-- M9 mission engine: definitions, objectives, instances, daily/weekly
-- assignment, server-derived progress, idempotent M5 rewards.
--
-- Boundaries: validated M4 attempts in, M5 ledgers out. No mission_xp /
-- mission_coins side balances; no second streak engine (M5 streaks stay
-- authoritative). No clan/season/tournament logic (types reserved only).

DO $$ BEGIN
  CREATE TYPE public.mission_status AS ENUM ('draft', 'active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.mission_instance_status AS ENUM (
    'locked', 'available', 'active', 'completed', 'expired', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.mission_period AS ENUM ('daily', 'weekly', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Definitions (reusable) + immutable version snapshots.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'DAILY'
    CHECK (category IN (
      'GAME_COMPLETION', 'ACCURACY_TARGET', 'WPM_TARGET', 'SCORE_TARGET',
      'WORD_COUNT', 'CHARACTER_COUNT', 'PERFECT_RUN', 'COMBO_TARGET',
      'WORLD_PROGRESS', 'MULTI_GAME', 'DAILY', 'WEEKLY', 'EVENT',
      'COMPETITION', 'CLAN', 'SEASONAL')),
  world_id text,
  difficulty text NOT NULL DEFAULT 'beginner',
  skill_band text,
  objective_type text NOT NULL DEFAULT 'GAMES_COMPLETED',
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  game_constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_days int CHECK (duration_days IS NULL OR duration_days > 0),
  status public.mission_status NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  prerequisites jsonb NOT NULL DEFAULT '{}'::jsonb,
  reward_profile jsonb NOT NULL DEFAULT '{"xp": 20, "coins": 2}'::jsonb,
  visibility text NOT NULL DEFAULT 'batch'
    CHECK (visibility IN ('public', 'organization', 'batch')),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.mission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  version int NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, version)
);

CREATE TABLE IF NOT EXISTS public.mission_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position >= 0),
  kind text NOT NULL
    CHECK (kind IN (
      'GAMES_COMPLETED', 'ACCURACY_REACHED', 'WPM_REACHED', 'SCORE_REACHED',
      'CHARS_TYPED', 'WORDS_TYPED', 'PERFECT_RUN', 'DISTINCT_GAMES',
      'PERSONAL_BEST', 'WORLD_GAMES')),
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (mission_id, position)
);

-- ---------------------------------------------------------------------------
-- Instances (per student, per period) + audit trail. Completed rows are
-- immutable: sync never rewrites a completed instance.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mission_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  period public.mission_period NOT NULL,
  period_start date NOT NULL,
  status public.mission_instance_status NOT NULL DEFAULT 'available',
  progress jsonb NOT NULL DEFAULT '{"objectives": []}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  reward_status text NOT NULL DEFAULT 'pending'
    CHECK (reward_status IN ('pending', 'awarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id, period_start)
);
CREATE INDEX IF NOT EXISTS mission_instances_user_idx
  ON public.mission_instances (user_id, period_start DESC);

-- Which validated attempts contributed (dedupe + audit).
CREATE TABLE IF NOT EXISTS public.mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.mission_instances (id)
    ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.game_attempts (id)
    ON DELETE CASCADE,
  contribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, attempt_id)
);

CREATE TABLE IF NOT EXISTS public.mission_completion_events (
  key text PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES public.mission_instances (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_mission_assignments (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  day date NOT NULL,
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.mission_instances (id)
    ON DELETE CASCADE,
  PRIMARY KEY (user_id, day, mission_id)
);

CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.mission_instances (id)
    ON DELETE CASCADE,
  PRIMARY KEY (user_id, week_start, mission_id)
);

CREATE TABLE IF NOT EXISTS public.mission_reward_events (
  key text PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES public.mission_instances (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  xp int NOT NULL DEFAULT 0,
  coins int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Helpers: staff predicate, timezone-aware period bounds, eligibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_mission_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'super_admin')
  );
$$;

-- A viewer may see a student's mission data: self, their batch teacher,
-- mission admin, or super admin. RLS stays authoritative; fns re-check.
CREATE OR REPLACE FUNCTION public.fn_can_view_mission_student(p_student uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN false;
  END IF;
  IF v_me = p_student THEN
    RETURN true;
  END IF;
  IF public.is_super_admin() OR public.fn_is_mission_admin() THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.batch_members m
    WHERE m.user_id = p_student AND public.is_teacher_of_batch(m.batch_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_mission_tz(p_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF((SELECT timezone FROM public.profiles WHERE id = p_user), ''), 'UTC');
$$;

-- Eligibility with human reasons (mirrors evaluateUnlock missing[]).
CREATE OR REPLACE FUNCTION public.fn_mission_eligibility(
  p_mission uuid, p_user uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pre jsonb;
  v_level int := 1;
  v_xp int := 0;
  v_reasons text[] := '{}';
  v_slug text;
  v_badge text;
BEGIN
  SELECT prerequisites INTO v_pre FROM public.missions WHERE id = p_mission;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'reasons', ARRAY['UNKNOWN_MISSION']);
  END IF;
  SELECT COALESCE(current_level, 1), COALESCE(xp_total, 0)
    INTO v_level, v_xp
  FROM public.profiles WHERE id = p_user;
  IF (v_pre ->> 'minLevel')::int IS NOT NULL
    AND v_level < (v_pre ->> 'minLevel')::int THEN
    v_reasons := v_reasons || ARRAY['REQUIRES_LEVEL_' || (v_pre ->> 'minLevel')];
  END IF;
  IF (v_pre ->> 'minXp')::int IS NOT NULL
    AND v_xp < (v_pre ->> 'minXp')::int THEN
    v_reasons := v_reasons || ARRAY['REQUIRES_XP'];
  END IF;
  FOR v_slug IN SELECT * FROM jsonb_array_elements_text(COALESCE(v_pre -> 'games', '[]'::jsonb)) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.game_unlocks
      WHERE user_id = p_user AND game_slug = v_slug AND unlocked
    ) THEN
      v_reasons := v_reasons || ARRAY['REQUIRES_GAME_' || v_slug];
    END IF;
  END LOOP;
  FOR v_slug IN SELECT * FROM jsonb_array_elements_text(COALESCE(v_pre -> 'missions', '[]'::jsonb)) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.mission_instances i
      JOIN public.missions m ON m.id = i.mission_id
      WHERE i.user_id = p_user AND m.slug = v_slug AND i.status = 'completed'
    ) THEN
      v_reasons := v_reasons || ARRAY['REQUIRES_MISSION_' || v_slug];
    END IF;
  END LOOP;
  FOR v_badge IN SELECT * FROM jsonb_array_elements_text(COALESCE(v_pre -> 'badges', '[]'::jsonb)) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.badge_awards
      WHERE user_id = p_user AND badge_id = v_badge
    ) THEN
      v_reasons := v_reasons || ARRAY['REQUIRES_BADGE_' || v_badge];
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'eligible', v_reasons = '{}',
    'reasons', to_jsonb(v_reasons));
END;
$$;
