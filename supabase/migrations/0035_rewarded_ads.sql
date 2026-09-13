-- M17 rewarded ads: server-controlled sessions over a
-- provider-abstracted verification model. Google Offerwall manages its
-- own ad/reward interaction (no custom server callback exists), so
-- Google completions stay fail-closed; the mock provider is
-- development-only. Rewards reuse M5/shop infrastructure — no wallet,
-- no mint, no transfers.

-- Controlled reward catalog (allow-list; admins toggle, never invent).
CREATE TABLE IF NOT EXISTS public.rewarded_ad_reward_definitions (
  slug text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('item', 'coins', 'streak_recovery')),
  ref text NOT NULL,
  amount int NOT NULL DEFAULT 1 CHECK (amount >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.rewarded_ad_reward_definitions (slug, kind, ref, amount, enabled)
VALUES
  ('retry-token', 'item', 'retry-token', 1, true),
  ('streak-recovery-1d', 'streak_recovery', '1', 1, true),
  ('welcome-frame', 'item', 'welcome-frame', 1, false)
ON CONFLICT (slug) DO NOTHING;

-- Singleton policy (one row; admin-tuned, server-enforced).
CREATE TABLE IF NOT EXISTS public.rewarded_ad_policy (
  id int PRIMARY KEY DEFAULT 0 CHECK (id = 0),
  enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'mock'
    CHECK (provider IN ('google_offerwall', 'mock')),
  mock_allowed boolean NOT NULL DEFAULT true,
  daily_limit int NOT NULL DEFAULT 5 CHECK (daily_limit >= 0),
  cooldown_minutes int NOT NULL DEFAULT 60 CHECK (cooldown_minutes >= 0),
  max_rewards_per_day int NOT NULL DEFAULT 5 CHECK (max_rewards_per_day >= 0),
  -- Coins stay disabled until a compliant indirect-reward reading is
  -- explicitly approved; items are the default reward surface.
  allow_coin_rewards boolean NOT NULL DEFAULT false,
  recovery_max_days int NOT NULL DEFAULT 2 CHECK (recovery_max_days BETWEEN 1 AND 7),
  recovery_ads_per_day int NOT NULL DEFAULT 1 CHECK (recovery_ads_per_day >= 1),
  recovery_window_days int NOT NULL DEFAULT 3 CHECK (recovery_window_days >= 1),
  recovery_cooldown_hours int NOT NULL DEFAULT 24 CHECK (recovery_cooldown_hours >= 0),
  recovery_max_uses int NOT NULL DEFAULT 4 CHECK (recovery_max_uses >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.rewarded_ad_policy (id)
VALUES (0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('REWARDED_ADS_ENABLED', false, 'Rewarded ads master switch (fail closed)'),
  ('GOOGLE_REWARDED_ENABLED', false, 'Google Offerwall rewarded flow (fail closed)')
ON CONFLICT (key) DO NOTHING;

-- Server-controlled sessions (browser never decides outcomes).
CREATE TABLE IF NOT EXISTS public.rewarded_ad_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_offerwall', 'mock')),
  reward_slug text NOT NULL REFERENCES public.rewarded_ad_reward_definitions (slug)
    ON DELETE RESTRICT,
  placement text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN (
      'offered', 'opted_in', 'started', 'completed', 'verified',
      'rewarded', 'failed', 'expired', 'cancelled')),
  provider_reference text,
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  opted_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  rewarded_at timestamptz
);
CREATE INDEX IF NOT EXISTS rewarded_sessions_user_idx
  ON public.rewarded_ad_sessions (user_id, created_at DESC);

-- Analytics events (funnel only; no personal data beyond ownership).
CREATE TABLE IF NOT EXISTS public.rewarded_ad_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.rewarded_ad_sessions (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event text NOT NULL
    CHECK (event IN (
      'opportunity_shown', 'user_opted_in', 'ad_started', 'ad_completed',
      'verification_success', 'verification_failure', 'reward_granted',
      'reward_denied', 'reward_duplicate', 'user_declined', 'no_fill',
      'provider_error')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rewarded_events_user_idx
  ON public.rewarded_ad_events (user_id, created_at DESC);

-- Exactly-once grant ledger (one row per rewarded session, ever).
CREATE TABLE IF NOT EXISTS public.rewarded_ad_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.rewarded_ad_sessions (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('item', 'coins', 'streak_recovery')),
  ref text NOT NULL,
  amount int NOT NULL DEFAULT 1,
  grant_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Streak recovery audit (restores state, never manufactures activity:
-- no streak_events rows are ever written here).
CREATE TABLE IF NOT EXISTS public.streak_recoveries (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recovered_date date NOT NULL,
  session_id uuid NOT NULL REFERENCES public.rewarded_ad_sessions (id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recovered_date)
);

CREATE TABLE IF NOT EXISTS public.rewarded_ad_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid REFERENCES public.rewarded_ad_sessions (id)
    ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: own sessions/events/grants/recoveries; defs/policy/flags readable
-- (no secrets anywhere); admin audit reads. No client writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.rewarded_ad_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_reward_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rad_sessions_own ON public.rewarded_ad_sessions;
DROP POLICY IF EXISTS rad_sessions_admin ON public.rewarded_ad_sessions;
DROP POLICY IF EXISTS rad_events_own ON public.rewarded_ad_events;
DROP POLICY IF EXISTS rad_events_admin ON public.rewarded_ad_events;
DROP POLICY IF EXISTS rad_grants_own ON public.rewarded_ad_grants;
DROP POLICY IF EXISTS rad_recoveries_own ON public.streak_recoveries;
DROP POLICY IF EXISTS rad_audit_admin ON public.rewarded_ad_audit;
DROP POLICY IF EXISTS rad_defs_select ON public.rewarded_ad_reward_definitions;
DROP POLICY IF EXISTS rad_policy_select ON public.rewarded_ad_policy;

CREATE POLICY rad_sessions_own ON public.rewarded_ad_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rad_sessions_admin ON public.rewarded_ad_sessions
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());
CREATE POLICY rad_events_own ON public.rewarded_ad_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rad_events_admin ON public.rewarded_ad_events
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());
CREATE POLICY rad_grants_own ON public.rewarded_ad_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rad_recoveries_own ON public.streak_recoveries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rad_audit_admin ON public.rewarded_ad_audit
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());
CREATE POLICY rad_defs_select ON public.rewarded_ad_reward_definitions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rad_policy_select ON public.rewarded_ad_policy
  FOR SELECT TO authenticated USING (true);
