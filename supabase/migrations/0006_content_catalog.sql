-- M4 0006: content catalog tables (operational store for @tap/content data).
--
-- Source of truth is the TypeScript catalog; rows are loaded by
-- scripts/seed-catalog.ts (service_role, staging/prod). Scoring + difficulty
-- profiles are seeded inline here (tiny, stable, versioned with the schema —
-- keep them in sync with @tap/scoring and @tap/content by hand).
-- Attempts bind game_version_id (immutable), so content edits never rewrite
-- history. No RLS writes for API roles (seed script uses service_role).

-- ---------------------------------------------------------------------------
-- Worlds (16 adventure worlds; UI metadata only, no answers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worlds (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 80),
  sort_order int NOT NULL UNIQUE CHECK (sort_order > 0),
  name_en text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_bn text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Scoring + difficulty profiles (mirror the TS packages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scoring_profiles (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 80),
  wpm_weight numeric NOT NULL,
  accuracy_weight numeric NOT NULL,
  completion_bonus numeric NOT NULL DEFAULT 0,
  flawless_bonus numeric NOT NULL DEFAULT 0,
  multiplier numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.scoring_profiles
  (id, wpm_weight, accuracy_weight, completion_bonus, flawless_bonus, multiplier)
VALUES
  ('standard', 1, 1, 0.5, 25, 1),
  ('speed', 2, 0.5, 0.25, 10, 1),
  ('accuracy', 0.5, 2, 0.5, 50, 1),
  ('survival', 1, 1.5, 1, 40, 1),
  ('boss', 1.5, 1.5, 1, 100, 2),
  ('clan-aggregate', 1, 1, 0.5, 0, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.difficulty_profiles (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 80),
  prompt_min_len int NOT NULL CHECK (prompt_min_len > 0),
  prompt_max_len int NOT NULL CHECK (prompt_max_len >= prompt_min_len),
  vocab_sets text[] NOT NULL,
  allowed_errors int NOT NULL DEFAULT 0,
  target_accuracy numeric NOT NULL,
  target_wpm numeric NOT NULL,
  duration_sec int NOT NULL DEFAULT 0,
  punctuation numeric NOT NULL DEFAULT 0,
  numbers numeric NOT NULL DEFAULT 0,
  symbols numeric NOT NULL DEFAULT 0,
  sequence_complexity int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.difficulty_profiles
  (id, prompt_min_len, prompt_max_len, vocab_sets, allowed_errors,
   target_accuracy, target_wpm, duration_sec, punctuation, numbers, symbols,
   sequence_complexity)
VALUES
  ('beginner', 5, 20,
   ARRAY['home-row', 'alphabet-lower', 'beginner-words', 'short-sentences'],
   5, 85, 15, 0, 0, 0, 0, 1),
  ('intermediate', 15, 60,
   ARRAY['common-words', 'short-sentences', 'standard-sentences', 'numbers'],
   3, 90, 30, 60, 0.2, 0.1, 0.05, 3),
  ('expert', 40, 200,
   ARRAY['standard-sentences', 'common-words', 'numbers', 'symbols'],
   1, 95, 50, 120, 0.35, 0.2, 0.15, 5)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Prompt sets (versioned; items hold the actual answers → service_role only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prompt_sets (
  ref text PRIMARY KEY CHECK (char_length(ref) BETWEEN 1 AND 80),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  kind text NOT NULL
    CHECK (kind IN ('letters', 'words', 'sentences', 'numbers', 'symbols')),
  language text NOT NULL DEFAULT 'en',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Games (live pointer) + immutable game_versions (attempt audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 80),
  world_id text NOT NULL REFERENCES public.worlds (id) ON DELETE RESTRICT,
  category text NOT NULL,
  mechanic text NOT NULL,
  mode text NOT NULL,
  difficulty text NOT NULL,
  skill_bands text[] NOT NULL DEFAULT '{}',
  prompt_set_ref text NOT NULL REFERENCES public.prompt_sets (ref) ON DELETE RESTRICT,
  prompt_units int NOT NULL DEFAULT 10 CHECK (prompt_units > 0),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  timing jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_profile_id text NOT NULL REFERENCES public.scoring_profiles (id) ON DELETE RESTRICT,
  unlock_rule jsonb NOT NULL DEFAULT '{"type":"open"}'::jsonb,
  attempt_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  competition_eligible boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  current_version int NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS games_world_id_idx ON public.games (world_id);
CREATE INDEX IF NOT EXISTS games_active_idx ON public.games (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.game_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, version)
);
CREATE INDEX IF NOT EXISTS game_versions_game_id_idx ON public.game_versions (game_id);

-- ---------------------------------------------------------------------------
-- Catalog reads: worlds/games/profiles are public metadata (no answers).
-- Prompt sets + definitions writes stay service_role-only. game_versions is
-- authenticated-only (history detail beyond the public preview).
-- ---------------------------------------------------------------------------
ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.difficulty_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY worlds_select_public ON public.worlds
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY scoring_profiles_select_public ON public.scoring_profiles
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY difficulty_profiles_select_public ON public.difficulty_profiles
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY games_select_active ON public.games
  FOR SELECT TO anon, authenticated USING (is_active);

CREATE POLICY game_versions_select_active_game ON public.game_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_versions.game_id AND g.is_active
    )
  );
