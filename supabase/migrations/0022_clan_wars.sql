-- M11 clan wars: scheduled Clan A vs Clan B contexts. Explicit war rows
-- (never collapsed into ad-hoc aggregates) so multi-clan events,
-- tournaments, seasons and boss raids can reuse the lifecycle later.
--
-- Flow of validated play (unchanged models only):
-- war → eligible participant → M4 game attempt → war submission →
-- war contribution → clan aggregate → war score.

DO $$ BEGIN
  CREATE TYPE public.clan_war_status AS ENUM (
    'draft', 'challenge_sent', 'pending_response', 'accepted',
    'declined', 'preparation', 'live', 'processing', 'finalized',
    'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.clan_war_invite_status AS ENUM (
    'pending', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.clan_wars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_clan_id uuid NOT NULL REFERENCES public.clans (id)
    ON DELETE RESTRICT,
  defender_clan_id uuid NOT NULL REFERENCES public.clans (id)
    ON DELETE RESTRICT,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status public.clan_war_status NOT NULL DEFAULT 'draft',
  preparation_start timestamptz,
  battle_start timestamptz,
  battle_end timestamptz,
  scoring_profile jsonb NOT NULL DEFAULT
    '{"mode": "sum", "player_policy": "best_score"}'::jsonb,
  attempt_policy text NOT NULL DEFAULT 'BEST_SCORE',
  eligibility jsonb NOT NULL DEFAULT '{"scope": "same_course"}'::jsonb,
  reward_policy jsonb NOT NULL DEFAULT
    '{"winner_xp": 100, "winner_coins": 10, "participant_xp": 20, "participant_coins": 2}'::jsonb,
  rules jsonb NOT NULL DEFAULT
    '{"attempts_per_player": 5, "tie_breakers": ["total", "accuracy", "best", "participation", "earliest"]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CHECK (challenger_clan_id <> defender_clan_id),
  CHECK (battle_start IS NULL OR preparation_start IS NULL
         OR battle_start >= preparation_start),
  CHECK (battle_end IS NULL OR battle_start IS NULL
         OR battle_end > battle_start)
);
CREATE INDEX IF NOT EXISTS clan_wars_status_idx
  ON public.clan_wars (status);

-- Zero-hour preparation is legal (battle may open on accept).
ALTER TABLE public.clan_wars DROP CONSTRAINT IF EXISTS clan_wars_check1;
ALTER TABLE public.clan_wars ADD CONSTRAINT clan_wars_check1 CHECK (
  battle_start IS NULL OR preparation_start IS NULL
  OR battle_start >= preparation_start);

-- Invitation history (auditability for every challenge/response).
CREATE TABLE IF NOT EXISTS public.clan_war_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  from_clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  to_clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  status public.clan_war_invite_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Allowed game pool (M4 games only; no war game engine).
CREATE TABLE IF NOT EXISTS public.clan_war_games (
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE RESTRICT,
  PRIMARY KEY (war_id, game_id)
);

-- Eligibility snapshot: frozen at battle start so later batch moves
-- cannot rewrite history.
CREATE TABLE IF NOT EXISTS public.clan_war_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  eligible boolean NOT NULL DEFAULT true,
  eligibility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts_used int NOT NULL DEFAULT 0,
  best_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (war_id, user_id)
);

-- War submissions reference M4 attempts (no second attempt model).
CREATE TABLE IF NOT EXISTS public.clan_war_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  attempt_id uuid UNIQUE NOT NULL REFERENCES public.game_attempts (id)
    ON DELETE CASCADE,
  score numeric NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clan_war_attempts_war_idx
  ON public.clan_war_attempts (war_id);

-- Per-user war aggregates (war score, NOT clan XP).
CREATE TABLE IF NOT EXISTS public.clan_war_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  best_wpm numeric,
  best_accuracy numeric,
  UNIQUE (war_id, user_id)
);

-- Immutable clan totals (written once at finalization).
CREATE TABLE IF NOT EXISTS public.clan_war_results (
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  total_score numeric NOT NULL DEFAULT 0,
  participants int NOT NULL DEFAULT 0,
  rank int NOT NULL CHECK (rank > 0),
  is_winner boolean NOT NULL DEFAULT false,
  PRIMARY KEY (war_id, clan_id)
);

CREATE TABLE IF NOT EXISTS public.clan_war_state_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  from_status public.clan_war_status,
  to_status public.clan_war_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_war_reward_events (
  key text PRIMARY KEY,
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  xp int NOT NULL DEFAULT 0,
  coins int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clan_war_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  scope text NOT NULL,
  ref_id uuid NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Viewer predicate: member of either clan, teacher of either batch,
-- mission admin / super admin, or org admin of either clan's org.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_war_viewer(p_war uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_ch uuid;
  v_df uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN false;
  END IF;
  SELECT challenger_clan_id, defender_clan_id INTO v_ch, v_df
  FROM public.clan_wars WHERE id = p_war;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF public.fn_is_clan_viewer(v_ch) OR public.fn_is_clan_viewer(v_df) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- Strict transition map (single place; every hop audited by callers).
CREATE OR REPLACE FUNCTION public.fn_war_can_transition(
  p_from public.clan_war_status, p_to public.clan_war_status
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = 'draft' THEN p_to IN ('challenge_sent', 'cancelled')
    WHEN p_from = 'challenge_sent' THEN
      p_to IN ('pending_response', 'cancelled', 'expired')
    WHEN p_from = 'pending_response' THEN
      p_to IN ('accepted', 'declined', 'expired', 'cancelled')
    WHEN p_from = 'accepted' THEN p_to IN ('preparation', 'cancelled')
    WHEN p_from = 'preparation' THEN p_to IN ('live', 'cancelled')
    WHEN p_from = 'live' THEN p_to IN ('processing', 'cancelled')
    WHEN p_from = 'processing' THEN p_to IN ('finalized', 'live')
    ELSE false END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: war-visible reads; all writes via SECURITY DEFINER fns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clan_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clan_wars_select ON public.clan_wars;
DROP POLICY IF EXISTS clan_war_invites_select ON public.clan_war_invitations;
DROP POLICY IF EXISTS clan_war_games_select ON public.clan_war_games;
DROP POLICY IF EXISTS clan_war_parts_select ON public.clan_war_participants;
DROP POLICY IF EXISTS clan_war_attempts_select ON public.clan_war_attempts;
DROP POLICY IF EXISTS clan_war_contrib_select ON public.clan_war_contributions;
DROP POLICY IF EXISTS clan_war_results_select ON public.clan_war_results;
DROP POLICY IF EXISTS clan_war_events_select ON public.clan_war_state_events;
DROP POLICY IF EXISTS clan_war_rewards_select ON public.clan_war_reward_events;
DROP POLICY IF EXISTS clan_war_adjust_select ON public.clan_war_adjustments;
CREATE POLICY clan_wars_select ON public.clan_wars
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(id));
CREATE POLICY clan_war_invites_select ON public.clan_war_invitations
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_games_select ON public.clan_war_games
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_parts_select ON public.clan_war_participants
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_attempts_select ON public.clan_war_attempts
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_contrib_select ON public.clan_war_contributions
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_results_select ON public.clan_war_results
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_events_select ON public.clan_war_state_events
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
CREATE POLICY clan_war_rewards_select ON public.clan_war_reward_events
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.clan_wars w
               WHERE w.id = clan_war_reward_events.war_id
                 AND (public.fn_can_manage_clan(w.challenger_clan_id)
                   OR public.fn_can_manage_clan(w.defender_clan_id))));
CREATE POLICY clan_war_adjust_select ON public.clan_war_adjustments
  FOR SELECT TO authenticated USING (public.fn_is_war_viewer(war_id));
