-- M14 tournaments: orchestration over existing competitive systems.
-- A tournament never scores typing itself. Matches reference an existing
-- clan war / competition context; results flow back and the bracket
-- advances. Single elimination is implemented; double elimination,
-- round robin and Swiss are architecture-ready (format enum + plan hook,
-- never partial brackets).

DO $$ BEGIN
  CREATE TYPE public.tournament_status AS ENUM (
    'draft', 'registration_open', 'registration_closed', 'seeded',
    'live', 'processing', 'finalized', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tournament_format AS ENUM (
    'single_elimination', 'double_elimination', 'round_robin', 'swiss');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tournament_participant_type AS ENUM (
    'clan', 'student');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tournament_match_status AS ENUM (
    'pending', 'ready', 'live', 'processing',
    'finalized', 'bye', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tournament_match_source AS ENUM (
    'clan_war', 'competition', 'bye', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT '',
  format public.tournament_format NOT NULL DEFAULT 'single_elimination',
  participant_type public.tournament_participant_type NOT NULL,
  status public.tournament_status NOT NULL DEFAULT 'draft',
  organization_id uuid,
  registration_start timestamptz,
  registration_end timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  participant_cap int CHECK (participant_cap IS NULL OR participant_cap >= 2),
  -- eligibility: {min_level, course_ids[], batch_ids[], organization_id}
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- scoring_policy: {primary, tie_breakers[], source: clan_war|competition}
  scoring_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- reward_policy: {champion_xp, finalist_xp, semi_xp, participation_xp,
  --   champion_coins, ..., member_* variants for clan tournaments}
  reward_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  season_id uuid REFERENCES public.seasons (id) ON DELETE SET NULL,
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CHECK (registration_start IS NULL OR registration_end IS NULL
         OR registration_end > registration_start),
  CHECK (start_at IS NULL OR end_at IS NULL OR end_at > start_at)
);
CREATE INDEX IF NOT EXISTS tournaments_status_idx
  ON public.tournaments (status);

CREATE TABLE IF NOT EXISTS public.tournament_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  version int NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, version)
);

-- Frozen-at-seeding participants. One row per participant per tournament.
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  participant_type public.tournament_participant_type NOT NULL,
  participant_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'withdrawn')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, participant_id)
);
CREATE INDEX IF NOT EXISTS tournament_parts_tournament_idx
  ON public.tournament_participants (tournament_id);

-- Immutable once written (seed number + frozen source reference).
CREATE TABLE IF NOT EXISTS public.tournament_seeding (
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  seed int NOT NULL CHECK (seed > 0),
  source text NOT NULL,
  snapshot_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, participant_id),
  UNIQUE (tournament_id, seed)
);

CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  round_no int NOT NULL CHECK (round_no > 0),
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'live', 'finalized', 'cancelled')),
  UNIQUE (tournament_id, round_no)
);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.tournament_rounds (id)
    ON DELETE CASCADE,
  slot int NOT NULL CHECK (slot > 0),
  participant_a uuid,
  participant_b uuid,
  child_match_a uuid REFERENCES public.tournament_matches (id)
    ON DELETE SET NULL,
  child_match_b uuid REFERENCES public.tournament_matches (id)
    ON DELETE SET NULL,
  status public.tournament_match_status NOT NULL DEFAULT 'pending',
  start_at timestamptz,
  end_at timestamptz,
  source_type public.tournament_match_source NOT NULL DEFAULT 'manual',
  source_id uuid,
  winner_id uuid,
  loser_id uuid,
  score_a numeric,
  score_b numeric,
  -- metrics: {accuracy_a, accuracy_b, best_a, best_b,
  --   participation_a, participation_b, earliest_a, earliest_b}
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  tie_break text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (tournament_id, round_id, slot),
  -- Future-round slots start empty (both null); filled slots must differ.
  CHECK (participant_a IS DISTINCT FROM participant_b
         OR (participant_a IS NULL AND participant_b IS NULL)),
  CHECK (winner_id IS NULL OR winner_id IN (participant_a, participant_b)),
  CHECK (loser_id IS NULL OR loser_id IN (participant_a, participant_b)),
  CHECK (winner_id IS NULL OR loser_id IS NULL OR winner_id <> loser_id)
);
CREATE INDEX IF NOT EXISTS tournament_matches_round_idx
  ON public.tournament_matches (round_id);

-- Exactly one side per participant per match (no double-slotting).
CREATE TABLE IF NOT EXISTS public.tournament_match_participants (
  match_id uuid NOT NULL REFERENCES public.tournament_matches (id)
    ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('a', 'b')),
  PRIMARY KEY (match_id, participant_id),
  UNIQUE (match_id, side)
);

-- Immutable final placements (written once at finalization).
CREATE TABLE IF NOT EXISTS public.tournament_results (
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT '',
  placement int NOT NULL CHECK (placement > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tournament_id, participant_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_state_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  from_status public.tournament_status,
  to_status public.tournament_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_reward_events (
  key text PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  participant_type text NOT NULL,
  participant_id uuid NOT NULL,
  xp int NOT NULL DEFAULT 0,
  coins int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id)
    ON DELETE CASCADE,
  scope text NOT NULL,
  ref_id uuid NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Guards: finalized rows are immutable (the finalize transition itself
-- moves processing -> finalized, so OLD.status = 'finalized' never
-- passes here). Matches additionally freeze once finalized.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_tournament_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status::text = 'finalized' THEN
    RAISE EXCEPTION 'IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'tournament_matches'
     AND OLD.status::text = 'bye' AND NEW.status::text <> 'bye' THEN
    RAISE EXCEPTION 'IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_tournament_immutable ON public.tournaments;
CREATE TRIGGER guard_tournament_immutable
BEFORE UPDATE ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_tournament_immutable();

DROP TRIGGER IF EXISTS guard_tmatch_immutable ON public.tournament_matches;
CREATE TRIGGER guard_tmatch_immutable
BEFORE UPDATE ON public.tournament_matches
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_tournament_immutable();

-- ---------------------------------------------------------------------------
-- Strict transition maps (single place; every hop audited by callers).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tournament_can_transition(
  p_from public.tournament_status, p_to public.tournament_status
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = 'draft' THEN p_to IN ('registration_open', 'cancelled')
    WHEN p_from = 'registration_open' THEN
      p_to IN ('registration_closed', 'cancelled')
    WHEN p_from = 'registration_closed' THEN
      p_to IN ('seeded', 'registration_open', 'cancelled')
    WHEN p_from = 'seeded' THEN p_to IN ('live', 'cancelled')
    WHEN p_from = 'live' THEN p_to IN ('processing', 'cancelled')
    WHEN p_from = 'processing' THEN p_to IN ('finalized', 'live')
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.fn_tmatch_can_transition(
  p_from public.tournament_match_status, p_to public.tournament_match_status
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = 'pending' THEN p_to IN ('ready', 'cancelled')
    WHEN p_from = 'ready' THEN p_to IN ('live', 'cancelled')
    WHEN p_from = 'live' THEN p_to IN ('processing', 'cancelled')
    WHEN p_from = 'processing' THEN p_to IN ('finalized', 'live')
    ELSE false END;
$$;

-- ---------------------------------------------------------------------------
-- Access: global admins (mission admin / super admin) manage everything;
-- org admins manage their organization's tournaments. Brackets of
-- non-draft tournaments are readable (display data only); rewards are
-- own-or-admin. Teachers are read-only by construction (no write
-- policies; every mutation goes through role-checked SECURITY DEFINER
-- fns). Students can never write tournament state directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_tournament_admin(p_tournament uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF public.is_super_admin() OR public.fn_is_mission_admin() THEN
    RETURN true;
  END IF;
  SELECT organization_id INTO v_org FROM public.tournaments
  WHERE id = p_tournament;
  IF NOT FOUND OR v_org IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.is_org_admin(v_org);
END;
$$;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_seeding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournaments_select ON public.tournaments;
DROP POLICY IF EXISTS tournaments_admin ON public.tournaments;
DROP POLICY IF EXISTS tournament_versions_select ON public.tournament_versions;
DROP POLICY IF EXISTS tournament_parts_select ON public.tournament_participants;
DROP POLICY IF EXISTS tournament_seeding_select ON public.tournament_seeding;
DROP POLICY IF EXISTS tournament_rounds_select ON public.tournament_rounds;
DROP POLICY IF EXISTS tournament_matches_select ON public.tournament_matches;
DROP POLICY IF EXISTS tournament_mparts_select ON public.tournament_match_participants;
DROP POLICY IF EXISTS tournament_results_select ON public.tournament_results;
DROP POLICY IF EXISTS tournament_events_select ON public.tournament_state_events;
DROP POLICY IF EXISTS tournament_rewards_select ON public.tournament_reward_events;
DROP POLICY IF EXISTS tournament_adjust_select ON public.tournament_adjustments;

CREATE POLICY tournaments_select ON public.tournaments
  FOR SELECT TO authenticated USING (status <> 'draft');
CREATE POLICY tournaments_admin ON public.tournaments
  FOR SELECT TO authenticated
  USING (public.fn_is_tournament_admin(id));

CREATE POLICY tournament_versions_select ON public.tournament_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_versions.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_parts_select ON public.tournament_participants
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_participants.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_seeding_select ON public.tournament_seeding
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_seeding.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_rounds_select ON public.tournament_rounds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_matches_select ON public.tournament_matches
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_mparts_select ON public.tournament_match_participants
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournament_matches m
      JOIN public.tournaments t ON t.id = m.tournament_id
      WHERE m.id = tournament_match_participants.match_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_results_select ON public.tournament_results
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_results.tournament_id AND t.status <> 'draft'));

CREATE POLICY tournament_events_select ON public.tournament_state_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_state_events.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));

CREATE POLICY tournament_rewards_select ON public.tournament_reward_events
  FOR SELECT TO authenticated USING (
    (participant_type = 'student' AND participant_id = auth.uid())
    OR public.fn_is_tournament_admin(tournament_id));

CREATE POLICY tournament_adjust_select ON public.tournament_adjustments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_adjustments.tournament_id
        AND (t.status <> 'draft' OR public.fn_is_tournament_admin(t.id))));
