-- M10 clan foundation: explicit Clan entity bound 1:1 to Batch.
--
-- A batch IS the default clan identity socially, but Clan stays a separate
-- row so wars/seasons/cross-course play can evolve without touching the
-- batch system. Membership/contribution/event data is derived — personal
-- XP ledgers, batch_members and attempts are never duplicated.

DO $$ BEGIN
  CREATE TYPE public.clan_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.clan_member_role AS ENUM ('leader', 'co_leader', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.clan_member_status AS ENUM ('active', 'inactive', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.clan_help_status AS ENUM (
    'open', 'partially_fulfilled', 'fulfilled', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.batches (id)
    ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations (id)
    ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 100),
  motto text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  banner_key text,
  emblem_key text,
  -- Contribution formula config (extension point; see docs/clans.md).
  contribution_rule jsonb NOT NULL DEFAULT '{"points_per_score": 10}'::jsonb,
  status public.clan_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role public.clan_member_role NOT NULL DEFAULT 'member',
  status public.clan_member_status NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (clan_id, user_id)
);
-- One active batch-clan per student (mirrors batch_members single-active).
CREATE UNIQUE INDEX IF NOT EXISTS clan_members_one_active_uniq
  ON public.clan_members (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS clan_members_clan_idx
  ON public.clan_members (clan_id);

CREATE TABLE IF NOT EXISTS public.clan_leadership_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL
    CHECK (action IN (
      'assign_leader', 'assign_co_leader', 'remove_co_leader',
      'transfer_leadership', 'demote')),
  target_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Derived contribution events (one row per validated attempt max).
CREATE TABLE IF NOT EXISTS public.clan_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  attempt_id uuid UNIQUE REFERENCES public.game_attempts (id)
    ON DELETE CASCADE,
  points int NOT NULL CHECK (points >= 0),
  source text NOT NULL DEFAULT 'attempt',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clan_contributions_clan_idx
  ON public.clan_contributions (clan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS clan_contributions_user_idx
  ON public.clan_contributions (user_id);

-- Clan-scoped mission runs (reuse M9 mission definitions, own progress).
CREATE TABLE IF NOT EXISTS public.clan_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  period_start date NOT NULL DEFAULT CURRENT_DATE,
  status public.mission_instance_status NOT NULL DEFAULT 'available',
  progress jsonb NOT NULL DEFAULT '{"objectives": []}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, clan_id, period_start)
);

CREATE TABLE IF NOT EXISTS public.clan_mission_completion_events (
  key text PRIMARY KEY,
  clan_mission_id uuid NOT NULL REFERENCES public.clan_missions (id)
    ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- User-facing feed (privacy-safe summaries only).
CREATE TABLE IF NOT EXISTS public.clan_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clan_activity_clan_idx
  ON public.clan_activity (clan_id, created_at DESC);

-- Machine hooks for future notification delivery (help requested/
-- fulfilled, mission completed, leadership changed, member joined/left,
-- achievement). Writers log here alongside clan_activity.
CREATE TABLE IF NOT EXISTS public.clan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clan_events_clan_idx
  ON public.clan_events (clan_id, created_at DESC);

-- Bounded help system (coin cost + capped system XP; see docs/clan-help.md).
CREATE TABLE IF NOT EXISTS public.clan_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES public.profiles (id)
    ON DELETE CASCADE,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested int NOT NULL CHECK (requested > 0),
  fulfilled int NOT NULL DEFAULT 0 CHECK (fulfilled >= 0),
  status public.clan_help_status NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fulfilled <= requested)
);

CREATE TABLE IF NOT EXISTS public.clan_help_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.clan_help_requests (id)
    ON DELETE CASCADE,
  supporter_user_id uuid NOT NULL REFERENCES public.profiles (id)
    ON DELETE CASCADE,
  amount int NOT NULL CHECK (amount > 0),
  cost_coins int NOT NULL CHECK (cost_coins >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, supporter_user_id)
);

-- ---------------------------------------------------------------------------
-- Viewer predicate: active member, batch teacher, or admin/super.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_clan_viewer(p_clan uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_batch uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_members
             WHERE clan_id = p_clan AND user_id = v_me
               AND status = 'active') THEN
    RETURN true;
  END IF;
  SELECT batch_id INTO v_batch FROM public.clans WHERE id = p_clan;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF public.is_teacher_of_batch(v_batch) THEN
    RETURN true;
  END IF;
  IF public.is_super_admin() OR public.fn_is_mission_admin() THEN
    RETURN true;
  END IF;
  RETURN public.is_org_admin(public.batch_organization_id(v_batch));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_clan_for_batch(p_batch uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clan uuid;
  v_batch record;
  v_slug text;
BEGIN
  SELECT id INTO v_clan FROM public.clans WHERE batch_id = p_batch;
  IF FOUND THEN
    RETURN v_clan;
  END IF;
  SELECT b.*, public.batch_organization_id(b.id) AS org_id
    INTO v_batch FROM public.batches b WHERE b.id = p_batch;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  v_slug := left(regexp_replace(lower(v_batch.name), '[^a-z0-9]+', '-', 'g'), 60)
    || '-' || left(v_batch.id::text, 8);
  INSERT INTO public.clans (batch_id, organization_id, name, slug)
  VALUES (p_batch, v_batch.org_id, v_batch.name, v_slug)
  ON CONFLICT (batch_id) DO NOTHING
  RETURNING id INTO v_clan;
  IF NOT FOUND THEN
    SELECT id INTO v_clan FROM public.clans WHERE batch_id = p_batch;
  END IF;
  RETURN v_clan;
END;
$$;

-- Internal: dual-write feed + hooks (writers call this, never clients).
CREATE OR REPLACE FUNCTION public.fn_log_clan(
  p_clan uuid, p_kind text, p_actor uuid, p_summary jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.clan_activity (clan_id, kind, actor_user_id, summary)
  VALUES (p_clan, p_kind, p_actor, COALESCE(p_summary, '{}'::jsonb));
  INSERT INTO public.clan_events (clan_id, kind, payload)
  VALUES (p_clan, p_kind,
    jsonb_build_object('actor', p_actor, 'summary', COALESCE(p_summary, '{}'::jsonb)));
END;
$$;

-- ---------------------------------------------------------------------------
-- Synchronization triggers (no frontend reliance).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_batch_clan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clan uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_clan_for_batch(NEW.id);
    RETURN NEW;
  END IF;
  SELECT id INTO v_clan FROM public.clans WHERE batch_id = NEW.id;
  IF FOUND AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    UPDATE public.clans
    SET status = CASE WHEN NEW.is_active THEN 'active'::public.clan_status
                      ELSE 'inactive'::public.clan_status END,
        updated_at = now()
    WHERE id = v_clan;
    PERFORM public.fn_log_clan(v_clan,
      CASE WHEN NEW.is_active THEN 'clan_reactivated' ELSE 'clan_deactivated' END,
      NULL, jsonb_build_object('batch_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batches_clan ON public.batches;
CREATE TRIGGER trg_batches_clan
AFTER INSERT OR UPDATE OF is_active ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_batch_clan();

CREATE OR REPLACE FUNCTION public.trg_sync_batch_member_clan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clan uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active THEN
      v_clan := public.fn_clan_for_batch(NEW.batch_id);
      -- Single active clan: close memberships in other clans first.
      UPDATE public.clan_members
      SET status = 'inactive', left_at = now()
      WHERE user_id = NEW.user_id AND status = 'active' AND clan_id <> v_clan;
      INSERT INTO public.clan_members (clan_id, user_id, status)
      VALUES (v_clan, NEW.user_id, 'active')
      ON CONFLICT (clan_id, user_id) DO UPDATE
        SET status = 'active', left_at = NULL;
      PERFORM public.fn_log_clan(v_clan, 'member_joined', NEW.user_id,
        jsonb_build_object('batch_id', NEW.batch_id));
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    UPDATE public.clan_members cm
    SET status = 'inactive', left_at = now()
    FROM public.clans c
    WHERE c.id = cm.clan_id AND c.batch_id = OLD.batch_id
      AND cm.user_id = OLD.user_id AND cm.status = 'active';
    SELECT id INTO v_clan FROM public.clans WHERE batch_id = OLD.batch_id;
    IF FOUND THEN
      PERFORM public.fn_log_clan(v_clan, 'member_left', OLD.user_id,
        jsonb_build_object('batch_id', OLD.batch_id));
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: deactivation or batch move closes the old clan membership;
  -- (re)activation in a batch re-syncs like an insert.
  IF OLD.is_active AND (NOT NEW.is_active OR NEW.batch_id <> OLD.batch_id) THEN
    UPDATE public.clan_members cm
    SET status = 'inactive', left_at = now()
    FROM public.clans c
    WHERE c.id = cm.clan_id AND c.batch_id = OLD.batch_id
      AND cm.user_id = OLD.user_id AND cm.status = 'active';
    SELECT id INTO v_clan FROM public.clans WHERE batch_id = OLD.batch_id;
    IF FOUND THEN
      PERFORM public.fn_log_clan(v_clan, 'member_left', OLD.user_id,
        jsonb_build_object('batch_id', OLD.batch_id));
    END IF;
  END IF;
  IF NEW.is_active AND (NOT OLD.is_active OR NEW.batch_id <> OLD.batch_id) THEN
    v_clan := public.fn_clan_for_batch(NEW.batch_id);
    UPDATE public.clan_members
    SET status = 'inactive', left_at = now()
    WHERE user_id = NEW.user_id AND status = 'active' AND clan_id <> v_clan;
    INSERT INTO public.clan_members (clan_id, user_id, status)
    VALUES (v_clan, NEW.user_id, 'active')
    ON CONFLICT (clan_id, user_id) DO UPDATE
      SET status = 'active', left_at = NULL;
    PERFORM public.fn_log_clan(v_clan, 'member_joined', NEW.user_id,
      jsonb_build_object('batch_id', NEW.batch_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_members_clan ON public.batch_members;
CREATE TRIGGER trg_batch_members_clan
AFTER INSERT OR UPDATE OR DELETE ON public.batch_members
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_batch_member_clan();

-- Account suspension/deactivation follows the student out of the clan;
-- reactivation restores membership where the batch row is still active.
CREATE OR REPLACE FUNCTION public.trg_sync_profile_clan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.account_status IS NOT DISTINCT FROM NEW.account_status THEN
    RETURN NEW;
  END IF;
  IF NEW.account_status <> 'active' THEN
    UPDATE public.clan_members
    SET status = 'inactive', left_at = now()
    WHERE user_id = NEW.id AND status = 'active';
  ELSE
    UPDATE public.clan_members cm
    SET status = 'active', left_at = NULL
    FROM public.clans c, public.batch_members bm
    WHERE cm.clan_id = c.id AND c.batch_id = bm.batch_id
      AND bm.user_id = NEW.id AND bm.is_active
      AND cm.user_id = NEW.id AND cm.status = 'inactive';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_clan ON public.profiles;
CREATE TRIGGER trg_profiles_clan
AFTER UPDATE OF account_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_profile_clan();

-- Contribution derivation: every validated attempt mints at most one
-- contribution event for the author's active clan (UNIQUE attempt_id).
CREATE OR REPLACE FUNCTION public.trg_attempt_clan_contribution()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt record;
  v_clan uuid;
  v_divisor int;
  v_points int;
BEGIN
  IF NOT NEW.is_valid THEN
    RETURN NEW;
  END IF;
  SELECT a.user_id, a.id INTO v_attempt
  FROM public.game_attempts a WHERE a.id = NEW.attempt_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  SELECT clan_id INTO v_clan FROM public.clan_members
  WHERE user_id = v_attempt.user_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE((contribution_rule ->> 'points_per_score')::int, 10)
    INTO v_divisor FROM public.clans WHERE id = v_clan;
  IF v_divisor IS NULL OR v_divisor <= 0 THEN
    v_divisor := 10;
  END IF;
  v_points := GREATEST(1, (NEW.score / v_divisor)::int);
  INSERT INTO public.clan_contributions (clan_id, user_id, attempt_id, points)
  VALUES (v_clan, v_attempt.user_id, NEW.attempt_id, v_points)
  ON CONFLICT (attempt_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attempt_results_contribution ON public.attempt_results;
CREATE TRIGGER trg_attempt_results_contribution
AFTER INSERT ON public.attempt_results
FOR EACH ROW EXECUTE FUNCTION public.trg_attempt_clan_contribution();

-- Backfill: batches/memberships predating this migration get clans.
INSERT INTO public.clans (batch_id, organization_id, name, slug)
SELECT b.id, public.batch_organization_id(b.id), b.name,
  left(regexp_replace(lower(b.name), '[^a-z0-9]+', '-', 'g'), 60)
    || '-' || left(b.id::text, 8)
FROM public.batches b
LEFT JOIN public.clans c ON c.batch_id = b.id
WHERE c.id IS NULL
ON CONFLICT (batch_id) DO NOTHING;

INSERT INTO public.clan_members (clan_id, user_id, status)
SELECT c.id, bm.user_id, 'active'
FROM public.batch_members bm
JOIN public.clans c ON c.batch_id = bm.batch_id
JOIN public.profiles p ON p.id = bm.user_id
WHERE bm.is_active AND p.account_status = 'active'
ON CONFLICT (clan_id, user_id) DO UPDATE SET status = 'active', left_at = NULL;

-- ---------------------------------------------------------------------------
-- RLS: clan-visible reads; all writes via SECURITY DEFINER fns/triggers.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_leadership_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_mission_completion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_help_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clans_select ON public.clans;
DROP POLICY IF EXISTS clan_members_select ON public.clan_members;
DROP POLICY IF EXISTS clan_audit_select ON public.clan_leadership_audit;
DROP POLICY IF EXISTS clan_contrib_select ON public.clan_contributions;
DROP POLICY IF EXISTS clan_missions_select ON public.clan_missions;
DROP POLICY IF EXISTS clan_mission_events_select ON public.clan_mission_completion_events;
DROP POLICY IF EXISTS clan_activity_select ON public.clan_activity;
DROP POLICY IF EXISTS clan_events_select ON public.clan_events;
DROP POLICY IF EXISTS clan_help_select ON public.clan_help_requests;
DROP POLICY IF EXISTS clan_help_contrib_select ON public.clan_help_contributions;
CREATE POLICY clans_select ON public.clans
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(id));

CREATE POLICY clan_members_select ON public.clan_members
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_audit_select ON public.clan_leadership_audit
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_contrib_select ON public.clan_contributions
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_missions_select ON public.clan_missions
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_mission_events_select
  ON public.clan_mission_completion_events
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_activity_select ON public.clan_activity
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_events_select ON public.clan_events
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_help_select ON public.clan_help_requests
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));

CREATE POLICY clan_help_contrib_select ON public.clan_help_contributions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clan_help_requests r
      WHERE r.id = clan_help_contributions.request_id
        AND public.fn_is_clan_viewer(r.clan_id)));
