-- M5 0008: progression + economy schema and seed data.
--
-- Ledgers are append-only (no UPDATE/DELETE policies for API roles, ever).
-- Cached balances live on profiles and are written ONLY by the SECURITY
-- DEFINER progression function (0009) — RLS grants API roles no UPDATE.
-- Amounts/curves are DATA (reward_profiles, levels): adjustable without code.

-- Cached progression state on the identity row (function-written only).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp_total int NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  ADD COLUMN IF NOT EXISTS coin_balance int NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  ADD COLUMN IF NOT EXISTS current_level int NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dhaka';

-- ---------------------------------------------------------------------------
-- Reward profiles (configurable amounts; mirrors @tap/economy defaults)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_profiles (
  id text PRIMARY KEY,
  xp_completion int NOT NULL DEFAULT 0,
  coin_completion int NOT NULL DEFAULT 0,
  xp_first_completion int NOT NULL DEFAULT 0,
  xp_personal_best int NOT NULL DEFAULT 0,
  coin_personal_best int NOT NULL DEFAULT 0,
  xp_accuracy_milestone int NOT NULL DEFAULT 0,
  accuracy_milestone_threshold numeric NOT NULL DEFAULT 95,
  xp_speed_milestone int NOT NULL DEFAULT 0,
  speed_milestone_wpm numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.reward_profiles
  (id, xp_completion, coin_completion, xp_first_completion, xp_personal_best,
   coin_personal_best, xp_accuracy_milestone, accuracy_milestone_threshold,
   xp_speed_milestone, speed_milestone_wpm)
VALUES
  ('default', 10, 2, 20, 15, 5, 10, 95, 10, 30)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Levels (data-driven curve; spec §8 suggestions for 1-5, tuned growth after)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.levels (
  level int PRIMARY KEY CHECK (level >= 1),
  required_xp int NOT NULL CHECK (required_xp >= 0),
  title_en text NOT NULL,
  title_bn text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.levels (level, required_xp, title_en, title_bn) VALUES
  (1, 0, 'Newcomer', 'নবাগত'),
  (2, 30, 'Rookie', 'নবীন'),
  (3, 80, 'Learner', 'শিক্ষানবিশ'),
  (4, 150, 'Typer', 'টাইপিস্ট'),
  (5, 250, 'Skilled', 'দক্ষ'),
  (6, 400, 'Swift', 'ক্ষিপ্র'),
  (7, 600, 'Accurate', 'নির্ভুল'),
  (8, 850, 'Explorer', 'অভিযাত্রী'),
  (9, 1150, 'Challenger', 'প্রতিদ্বন্দ্বী'),
  (10, 1500, 'Expert', 'বিশেষজ্ঞ'),
  (11, 2000, 'Master', 'মাস্টার'),
  (12, 2600, 'Champion', 'চ্যাম্পিয়ন'),
  (13, 3300, 'Veteran', 'অভিজ্ঞ'),
  (14, 4100, 'Elite', 'এলিট'),
  (15, 5000, 'Grandmaster', 'গ্র্যান্ডমাস্টার'),
  (16, 6200, 'Legend', 'কিংবদন্তি'),
  (17, 7600, 'Mythic', 'পৌরাণিক'),
  (18, 9200, 'Titan', 'টাইটান'),
  (19, 11000, 'Immortal', 'অমর'),
  (20, 13000, 'Hall of Legends', 'কিংবদন্তি হল')
ON CONFLICT (level) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Ledgers. reference_id carries the idempotency key
-- (e.g. 'attempt:{uuid}:progression:v1'); UNIQUE(user, source, reference)
-- makes double-grants structurally impossible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount int NOT NULL CHECK (amount <> 0),
  source text NOT NULL,
  source_type text NOT NULL DEFAULT 'attempt',
  reference_id text NOT NULL,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after int NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, reference_id)
);
CREATE INDEX IF NOT EXISTS xp_ledger_user_idx
  ON public.xp_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount int NOT NULL CHECK (amount <> 0),
  source text NOT NULL,
  source_type text NOT NULL DEFAULT 'attempt',
  reference_id text NOT NULL,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after int NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, reference_id),
  CHECK (balance_after >= 0)
);
CREATE INDEX IF NOT EXISTS coin_ledger_user_idx
  ON public.coin_ledger (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Badges: definitions (machine-evaluable criteria) vs one-time awards.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badges (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 80),
  name_en text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_bn text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN (
    'First Steps', 'Keyboard Mastery', 'Accuracy', 'Speed', 'Consistency',
    'Explorer', 'Competition', 'Clan', 'Seasonal', 'Elite')),
  icon_key text NOT NULL DEFAULT '',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- criteria mirrors @tap/progression BadgeCriterion shapes.
INSERT INTO public.badges
  (id, name_en, name_bn, description_en, category, icon_key, criteria)
VALUES
  ('first-key', 'First Key', 'প্রথম কী', 'Complete your first game.',
   'First Steps', 'badges/first-key/icon.webp', '{"kind":"first_completion"}'),
  ('home-row-hero', 'Home Row Hero', 'হোম রো হিরো', 'Complete 2 different games.',
   'Keyboard Mastery', 'badges/home-row-hero/icon.webp', '{"kind":"games_completed","min":2}'),
  ('hundred-words', '100 Words', '১০০ শব্দ', 'Type 100 words across runs.',
   'Keyboard Mastery', 'badges/hundred-words/icon.webp', '{"kind":"words_total","min":100}'),
  ('thousand-words', '1K Words', '১০০০ শব্দ', 'Type 1000 words across runs.',
   'Keyboard Mastery', 'badges/thousand-words/icon.webp', '{"kind":"words_total","min":1000}'),
  ('accuracy-ace', 'Accuracy Ace', 'নির্ভুল তারকা', 'Finish a run at 90%+ accuracy.',
   'Accuracy', 'badges/accuracy-ace/icon.webp', '{"kind":"accuracy_min","min":90}'),
  ('zero-error', 'Zero Error', 'শূন্য ভুল', 'Finish a run with zero errors.',
   'Accuracy', 'badges/zero-error/icon.webp', '{"kind":"zero_error_runs","min":1}'),
  ('wpm-20', '20 WPM', '২০ WPM', 'Reach 20 effective WPM.',
   'Speed', 'badges/wpm-20/icon.webp', '{"kind":"wpm_min","min":20}'),
  ('wpm-40', '40 WPM', '৪০ WPM', 'Reach 40 effective WPM.',
   'Speed', 'badges/wpm-40/icon.webp', '{"kind":"wpm_min","min":40}'),
  ('wpm-60', '60 WPM', '৬০ WPM', 'Reach 60 effective WPM.',
   'Speed', 'badges/wpm-60/icon.webp', '{"kind":"wpm_min","min":60}'),
  ('streak-7', '7-Day Streak', '৭ দিনের ধারা', 'Stay active 7 days in a row.',
   'Consistency', 'badges/streak-7/icon.webp', '{"kind":"streak_days","min":7}'),
  ('world-explorer', 'World Explorer', 'বিশ্ব অভিযাত্রী', 'Complete 5 different games.',
   'Explorer', 'badges/world-explorer/icon.webp', '{"kind":"games_completed","min":5}')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES public.badges (id) ON DELETE RESTRICT,
  attempt_id uuid REFERENCES public.game_attempts (id) ON DELETE SET NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS badge_awards_user_idx ON public.badge_awards (user_id);

-- ---------------------------------------------------------------------------
-- Achievements: milestone records (thresholds over lifetime stats).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 80),
  name_en text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  metric text NOT NULL CHECK (metric IN (
    'total_chars', 'total_words', 'attempts', 'best_wpm', 'best_accuracy',
    'streak_best')),
  threshold numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.achievements (id, name_en, metric, threshold) VALUES
  ('chars-1k', '1K Characters', 'total_chars', 1000),
  ('chars-10k', '10K Characters', 'total_chars', 10000),
  ('chars-100k', '100K Characters', 'total_chars', 100000),
  ('words-1k', '1K Words', 'total_words', 1000),
  ('attempts-10', '10 Attempts', 'attempts', 10),
  ('attempts-100', '100 Attempts', 'attempts', 100),
  ('wpm-40', '40 WPM Peak', 'best_wpm', 40),
  ('accuracy-95', '95% Precision', 'best_accuracy', 95),
  ('streak-7', 'Week of Fire', 'streak_best', 7),
  ('streak-30', 'Month of Fire', 'streak_best', 30)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.achievement_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievements (id) ON DELETE RESTRICT,
  value numeric NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS achievement_awards_user_idx
  ON public.achievement_awards (user_id);

-- ---------------------------------------------------------------------------
-- Streaks: one row per user + one row per qualifying day (idempotent days).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.streaks (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  current_count int NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  best_count int NOT NULL DEFAULT 0 CHECK (best_count >= 0),
  last_active_date date,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  active_days int NOT NULL DEFAULT 0 CHECK (active_days >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.streak_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  attempt_id uuid REFERENCES public.game_attempts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_date)
);
CREATE INDEX IF NOT EXISTS streak_events_user_idx ON public.streak_events (user_id);

-- ---------------------------------------------------------------------------
-- Personal records (best per game × metric; ties keep the older attempt).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_records (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN (
    'best_wpm', 'best_accuracy', 'best_score', 'fastest_ms', 'most_chars')),
  value numeric NOT NULL,
  attempt_id uuid NOT NULL REFERENCES public.game_attempts (id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id, metric)
);
CREATE INDEX IF NOT EXISTS personal_records_user_idx
  ON public.personal_records (user_id);

-- ---------------------------------------------------------------------------
-- Unlock cache (evaluated state; first-unlock time preserved).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_unlocks (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  game_slug text NOT NULL,
  unlocked boolean NOT NULL DEFAULT true,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, game_slug)
);

-- ---------------------------------------------------------------------------
-- Idempotency registry: one row per processed progression event.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_events (
  key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.game_attempts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS: catalog/config readable; everything earned is owner-readable,
-- function-written. No write policies for API roles — anywhere.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reward_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY reward_profiles_select_public ON public.reward_profiles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY levels_select_public ON public.levels
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY badges_select_public ON public.badges
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY achievements_select_public ON public.achievements
  FOR SELECT TO anon, authenticated USING (is_active);

CREATE POLICY xp_ledger_select_own ON public.xp_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY coin_ledger_select_own ON public.coin_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY badge_awards_select_own ON public.badge_awards
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY achievement_awards_select_own ON public.achievement_awards
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY streaks_select_own ON public.streaks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY streak_events_select_own ON public.streak_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY personal_records_select_own ON public.personal_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY game_unlocks_select_own ON public.game_unlocks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY reward_events_select_own ON public.reward_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
