-- M15 adaptive learning: skill profiles from validated attempts.
-- Consumes validated history only — never scores typing, never mints
-- XP/coins, never creates missions, never modifies game definitions.
-- Heavy recompute lives in fn_refresh_adaptive_profile (post-attempt +
-- sweep); reads serve cached rows so dashboards never run analytics
-- per render.

-- Learner profile (one row per student; cache header for the UI).
CREATE TABLE IF NOT EXISTS public.learner_skill_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  practice_band text NOT NULL DEFAULT 'beginner'
    CHECK (practice_band IN ('beginner', 'intermediate', 'expert')),
  algo_version text NOT NULL DEFAULT 'adaptive-v1',
  evidence_count int NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_attempt_at timestamptz,
  rec_cache_version int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Interpretable skill dimensions (one row per user per dimension).
CREATE TABLE IF NOT EXISTS public.learner_skill_dimensions (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  dimension text NOT NULL
    CHECK (dimension IN (
      'accuracy', 'wpm', 'consistency', 'completion', 'error_rate',
      'input_letters', 'input_words', 'input_sentences', 'input_numbers',
      'input_punctuation', 'input_capitalization', 'input_symbols',
      'input_mixed',
      'mech_reaction', 'mech_race', 'mech_survival', 'mech_sentence',
      'mech_word', 'mech_mixed')),
  value numeric NOT NULL DEFAULT 0,
  evidence int NOT NULL DEFAULT 0 CHECK (evidence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dimension)
);

-- Per-key evidence (one row per user per key; relational, not a blob).
CREATE TABLE IF NOT EXISTS public.adaptive_key_stats (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  key_char text NOT NULL CHECK (char_length(key_char) = 1),
  exposures int NOT NULL DEFAULT 0 CHECK (exposures >= 0),
  errors int NOT NULL DEFAULT 0 CHECK (errors >= 0),
  samples int NOT NULL DEFAULT 0 CHECK (samples >= 0),
  last_observed timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key_char),
  CHECK (errors <= exposures)
);

-- Per-finger aggregates (derived from key stats on refresh).
CREATE TABLE IF NOT EXISTS public.adaptive_finger_stats (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  finger text NOT NULL
    CHECK (finger IN (
      'left_pinky', 'left_ring', 'left_middle', 'left_index',
      'left_thumb', 'right_thumb', 'right_index', 'right_middle',
      'right_ring', 'right_pinky')),
  exposures int NOT NULL DEFAULT 0 CHECK (exposures >= 0),
  errors int NOT NULL DEFAULT 0 CHECK (errors >= 0),
  last_observed timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, finger),
  CHECK (errors <= exposures)
);

-- Observed confusion pairs (expected → typed), counted across attempts.
CREATE TABLE IF NOT EXISTS public.adaptive_error_pairs (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  expected_char text NOT NULL CHECK (char_length(expected_char) = 1),
  actual_char text NOT NULL CHECK (char_length(actual_char) = 1),
  pair_class text NOT NULL DEFAULT 'other'
    CHECK (pair_class IN (
      'letter_confusion', 'capitalization', 'punctuation', 'number_row',
      'space', 'symbol', 'other')),
  count int NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_observed timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, expected_char, actual_char),
  CHECK (expected_char <> actual_char)
);

-- One compact sample per validated attempt (trend/dimension source).
CREATE TABLE IF NOT EXISTS public.adaptive_attempt_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  attempt_id uuid UNIQUE NOT NULL REFERENCES public.game_attempts (id)
    ON DELETE CASCADE,
  game_slug text NOT NULL,
  mechanic text NOT NULL DEFAULT 'mixed',
  difficulty text NOT NULL DEFAULT 'beginner',
  accuracy numeric NOT NULL,
  wpm numeric NOT NULL,
  completion numeric NOT NULL DEFAULT 0,
  error_strokes int NOT NULL DEFAULT 0,
  corrections int NOT NULL DEFAULT 0,
  duration_ms int NOT NULL DEFAULT 0,
  prompt_len int NOT NULL DEFAULT 0,
  has_numbers boolean NOT NULL DEFAULT false,
  has_punct boolean NOT NULL DEFAULT false,
  has_caps boolean NOT NULL DEFAULT false,
  has_symbols boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adaptive_samples_user_idx
  ON public.adaptive_attempt_samples (user_id, submitted_at DESC);

-- Cached trends (recent window vs baseline medians).
CREATE TABLE IF NOT EXISTS public.adaptive_skill_trends (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('accuracy', 'wpm', 'error_rate')),
  recent_value numeric,
  baseline_value numeric,
  trend text NOT NULL DEFAULT 'insufficient'
    CHECK (trend IN ('improving', 'stable', 'declining', 'insufficient')),
  evidence int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, metric)
);

-- Materialized weakness ranking (refresh cache for recommendations).
CREATE TABLE IF NOT EXISTS public.adaptive_weaknesses (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('key', 'finger', 'dimension')),
  target text NOT NULL,
  prompt_kind text NOT NULL DEFAULT 'words'
    CHECK (prompt_kind IN ('letters', 'words', 'sentences', 'numbers', 'symbols')),
  score numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  evidence int NOT NULL DEFAULT 0,
  trend text NOT NULL DEFAULT 'insufficient',
  last_observed timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target)
);

-- Recommendation cache (ranked; superseded rows retire, never mutate).
CREATE TABLE IF NOT EXISTS public.adaptive_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  rank int NOT NULL CHECK (rank > 0),
  game_slug text NOT NULL REFERENCES public.games (slug) ON DELETE RESTRICT,
  difficulty text NOT NULL DEFAULT 'beginner',
  mission_id uuid REFERENCES public.missions (id) ON DELETE SET NULL,
  reason_code text NOT NULL
    CHECK (reason_code IN (
      'WEAK_KEY', 'WEAK_FINGER', 'LOW_ACCURACY', 'LOW_WPM',
      'DECLINING_TREND', 'UNLOCK_PREPARATION', 'DAILY_MISSION',
      'WEEKLY_CHALLENGE', 'PERSONAL_BEST_OPPORTUNITY')),
  message text NOT NULL DEFAULT '',
  expected_benefit text NOT NULL DEFAULT '',
  confidence numeric NOT NULL DEFAULT 0,
  priority numeric NOT NULL DEFAULT 0,
  targets text[] NOT NULL DEFAULT '{}',
  drill_words text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'accepted', 'completed', 'dismissed', 'superseded')),
  algo_version text NOT NULL DEFAULT 'adaptive-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS adaptive_recs_user_idx
  ON public.adaptive_recommendations (user_id, status, rank);

-- Observed recommendation outcomes (students cannot write scores).
CREATE TABLE IF NOT EXISTS public.adaptive_recommendation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recommendation_id uuid NOT NULL REFERENCES public.adaptive_recommendations (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event text NOT NULL
    CHECK (event IN (
      'shown', 'started', 'completed', 'abandoned', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adaptive_rec_events_user_idx
  ON public.adaptive_recommendation_events (user_id, created_at DESC);

-- Recent exposure per game (fatigue/diversity control).
CREATE TABLE IF NOT EXISTS public.adaptive_exposure (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  game_slug text NOT NULL,
  shows_in_window int NOT NULL DEFAULT 0 CHECK (shows_in_window >= 0),
  last_shown timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_slug)
);

-- Runtime difficulty layer (never modifies game definitions).
CREATE TABLE IF NOT EXISTS public.adaptive_game_difficulty (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  game_slug text NOT NULL,
  band text NOT NULL DEFAULT 'beginner'
    CHECK (band IN ('beginner', 'intermediate', 'expert')),
  prompt_min_len int NOT NULL DEFAULT 5,
  prompt_max_len int NOT NULL DEFAULT 20,
  target_wpm numeric NOT NULL DEFAULT 15,
  target_accuracy numeric NOT NULL DEFAULT 85,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_slug)
);

-- ---------------------------------------------------------------------------
-- QWERTY touch-typing map shared by refresh + tests.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adaptive_finger_for(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_key = ' ' THEN 'left_thumb'
    WHEN lower(p_key) IN ('`','1','q','a','z') THEN 'left_pinky'
    WHEN lower(p_key) IN ('2','w','s','x') THEN 'left_ring'
    WHEN lower(p_key) IN ('3','e','d','c') THEN 'left_middle'
    WHEN lower(p_key) IN ('4','5','r','t','f','g','v','b') THEN 'left_index'
    WHEN lower(p_key) IN ('6','7','y','u','h','j','n','m') THEN 'right_index'
    WHEN lower(p_key) IN ('8','i','k',',') THEN 'right_middle'
    WHEN lower(p_key) IN ('9','o','l','.') THEN 'right_ring'
    WHEN lower(p_key) IN ('0','-','=','p','[',']',';','''','/') THEN 'right_pinky'
    ELSE NULL END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: students read their own adaptive rows only. Teachers/admins read
-- aggregates through role-checked fns. No client writes anywhere.
-- ---------------------------------------------------------------------------
ALTER TABLE public.learner_skill_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_skill_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_key_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_finger_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_error_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_attempt_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_skill_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_weaknesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_recommendation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_exposure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_game_difficulty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adaptive_profile_own ON public.learner_skill_profiles;
DROP POLICY IF EXISTS adaptive_dims_own ON public.learner_skill_dimensions;
DROP POLICY IF EXISTS adaptive_keys_own ON public.adaptive_key_stats;
DROP POLICY IF EXISTS adaptive_fingers_own ON public.adaptive_finger_stats;
DROP POLICY IF EXISTS adaptive_pairs_own ON public.adaptive_error_pairs;
DROP POLICY IF EXISTS adaptive_samples_own ON public.adaptive_attempt_samples;
DROP POLICY IF EXISTS adaptive_trends_own ON public.adaptive_skill_trends;
DROP POLICY IF EXISTS adaptive_weak_own ON public.adaptive_weaknesses;
DROP POLICY IF EXISTS adaptive_recs_own ON public.adaptive_recommendations;
DROP POLICY IF EXISTS adaptive_events_own ON public.adaptive_recommendation_events;
DROP POLICY IF EXISTS adaptive_exposure_own ON public.adaptive_exposure;
DROP POLICY IF EXISTS adaptive_diff_own ON public.adaptive_game_difficulty;

CREATE POLICY adaptive_profile_own ON public.learner_skill_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_dims_own ON public.learner_skill_dimensions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_keys_own ON public.adaptive_key_stats
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_fingers_own ON public.adaptive_finger_stats
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_pairs_own ON public.adaptive_error_pairs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_samples_own ON public.adaptive_attempt_samples
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_trends_own ON public.adaptive_skill_trends
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_weak_own ON public.adaptive_weaknesses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_recs_own ON public.adaptive_recommendations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_events_own ON public.adaptive_recommendation_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_exposure_own ON public.adaptive_exposure
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_diff_own ON public.adaptive_game_difficulty
  FOR SELECT TO authenticated USING (user_id = auth.uid());
