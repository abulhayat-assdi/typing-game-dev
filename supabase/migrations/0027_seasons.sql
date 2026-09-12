-- M13 seasons: time-bounded competitive progression over finalized
-- M8/M9/M10/M11/M12 outcomes. Source systems are never modified and
-- lifetime history is never rewritten — seasons only append point events
-- and seal immutable result snapshots. No side XP/coin balances: season
-- points are a ranking metric; final rewards flow through M5 ledgers.

DO $$ BEGIN
  CREATE TYPE public.season_status AS ENUM (
    'draft', 'scheduled', 'active', 'processing', 'finalized', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT '',
  banner_key text,
  icon_key text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL CHECK (end_at > start_at),
  registration_start timestamptz,
  status public.season_status NOT NULL DEFAULT 'draft',
  -- scoring_policy.sources: {COMPETITION|CLAN_WAR|CLAN_BOSS|MISSION:
  --   {enabled, points per placement/role, daily_cap, ...}}
  scoring_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- reward_policy.individual: {first,second,third,participation} xp/coins.
  reward_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- rules: {overlap: GLOBAL_SINGLE|MULTIPLE_SCOPES,
  --   tie_breakers: [points, earliest, id]}
  rules jsonb NOT NULL DEFAULT '{"overlap": "GLOBAL_SINGLE"}'::jsonb,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.season_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  version int NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, version)
);

-- Frozen participants (later batch moves never rewrite these rows).
CREATE TABLE IF NOT EXISTS public.season_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('student', 'clan')),
  participant_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT '',
  course_id uuid,
  batch_id uuid,
  eligible boolean NOT NULL DEFAULT true,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'withdrawn')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, participant_type, participant_id)
);
CREATE INDEX IF NOT EXISTS season_parts_season_idx
  ON public.season_participants (season_id);

-- Per-season source toggles + point tables (admin-configured).
CREATE TABLE IF NOT EXISTS public.season_source_rules (
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  source_type text NOT NULL
    CHECK (source_type IN (
      'COMPETITION', 'CLAN_WAR', 'CLAN_BOSS', 'MISSION', 'ACHIEVEMENT')),
  enabled boolean NOT NULL DEFAULT true,
  points jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (season_id, source_type)
);

-- Append-only point ledger (never updated, never deleted).
CREATE TABLE IF NOT EXISTS public.season_point_events (
  key text PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  participant_type text NOT NULL CHECK (participant_type IN ('student', 'clan')),
  participant_id uuid NOT NULL,
  points int NOT NULL CHECK (points >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS season_points_board_idx
  ON public.season_point_events (season_id, participant_type, participant_id);

-- Tier bands per season (derived per snapshot, never stored on profiles).
CREATE TABLE IF NOT EXISTS public.season_tier_definitions (
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  tier text NOT NULL,
  min_points int NOT NULL DEFAULT 0,
  min_rank int,
  PRIMARY KEY (season_id, tier)
);

-- Immutable final board (written once at finalization).
CREATE TABLE IF NOT EXISTS public.season_results (
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('student', 'clan')),
  participant_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT '',
  points int NOT NULL DEFAULT 0,
  rank int NOT NULL CHECK (rank > 0),
  tier text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (season_id, participant_type, participant_id)
);

-- Full ordered board snapshot (one row per context at finalize).
CREATE TABLE IF NOT EXISTS public.season_leaderboard_snapshots (
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('student', 'clan')),
  board jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, participant_type)
);

CREATE TABLE IF NOT EXISTS public.season_reward_events (
  key text PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('student', 'clan')),
  participant_id uuid NOT NULL,
  xp int NOT NULL DEFAULT 0,
  coins int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.season_state_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  from_status public.season_status,
  to_status public.season_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.season_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons (id) ON DELETE CASCADE,
  participant_type text NOT NULL,
  participant_id uuid NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: seasons visible once scheduled; drafts to admins. Points/boards
-- readable (display names only); rewards own-or-admin. No client writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_source_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_point_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_tier_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seasons_select ON public.seasons;
DROP POLICY IF EXISTS seasons_admin ON public.seasons;
DROP POLICY IF EXISTS season_versions_select ON public.season_versions;
DROP POLICY IF EXISTS season_parts_select ON public.season_participants;
DROP POLICY IF EXISTS season_rules_select ON public.season_source_rules;
DROP POLICY IF EXISTS season_points_select ON public.season_point_events;
DROP POLICY IF EXISTS season_tiers_select ON public.season_tier_definitions;
DROP POLICY IF EXISTS season_results_select ON public.season_results;
DROP POLICY IF EXISTS season_snaps_select ON public.season_leaderboard_snapshots;
DROP POLICY IF EXISTS season_rewards_select ON public.season_reward_events;
DROP POLICY IF EXISTS season_events_select ON public.season_state_events;
DROP POLICY IF EXISTS season_adjust_select ON public.season_adjustments;
CREATE POLICY seasons_select ON public.seasons
  FOR SELECT TO authenticated USING (status <> 'draft');
CREATE POLICY seasons_admin ON public.seasons
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());

CREATE POLICY season_versions_select ON public.season_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_versions.season_id
        AND (s.status <> 'draft'
          OR public.fn_is_mission_admin() OR public.is_super_admin())));

CREATE POLICY season_parts_select ON public.season_participants
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_participants.season_id AND s.status <> 'draft'));

CREATE POLICY season_rules_select ON public.season_source_rules
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_source_rules.season_id AND s.status <> 'draft'));

CREATE POLICY season_points_select ON public.season_point_events
  FOR SELECT TO authenticated USING (
    (participant_type = 'student' AND participant_id = auth.uid())
    OR public.fn_is_mission_admin() OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.seasons s
               WHERE s.id = season_point_events.season_id
                 AND s.status = 'finalized'));

CREATE POLICY season_tiers_select ON public.season_tier_definitions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_tier_definitions.season_id AND s.status <> 'draft'));

CREATE POLICY season_results_select ON public.season_results
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_results.season_id AND s.status <> 'draft'));

CREATE POLICY season_snaps_select ON public.season_leaderboard_snapshots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_leaderboard_snapshots.season_id
        AND s.status IN ('processing', 'finalized')));

CREATE POLICY season_rewards_select ON public.season_reward_events
  FOR SELECT TO authenticated USING (
    (participant_type = 'student' AND participant_id = auth.uid())
    OR public.fn_is_mission_admin() OR public.is_super_admin());

CREATE POLICY season_events_select ON public.season_state_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_state_events.season_id AND s.status <> 'draft'));

CREATE POLICY season_adjust_select ON public.season_adjustments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.seasons s
      WHERE s.id = season_adjustments.season_id AND s.status <> 'draft'));
