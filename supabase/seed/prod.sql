-- PRODUCTION seed guard — safe to run repeatedly, inserts NO demo data.
-- Production starts from migrations alone (system catalog rows for
-- scoring/difficulty profiles, shop categories, reward definitions and
-- policy are all seeded idempotently inside the migrations themselves).
--
-- This script FAILS CLOSED if demo/staging markers are present, so a
-- mis-targeted psql invocation cannot silently contaminate production:
--   - Demo Academy org (dev.sql)
--   - Staging Academy org (staging.sql)
-- It then asserts the required system rows exist.
--
-- Usage: psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed/prod.sql

-- Fail closed on demo contamination.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'demo-academy') THEN
    RAISE EXCEPTION 'PROD_GUARD: demo-academy org present — refusing to seed production';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'staging-academy') THEN
    RAISE EXCEPTION 'PROD_GUARD: staging-academy org present — refusing to seed production';
  END IF;
END;
$$;

-- Required system catalog (populated by migrations; assert, never invent).
DO $$
DECLARE
  v_missing text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.scoring_profiles WHERE id = 'standard') THEN
    v_missing := v_missing || 'scoring_profiles:standard';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.difficulty_profiles WHERE id = 'beginner') THEN
    v_missing := v_missing || 'difficulty_profiles:beginner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.difficulty_profiles WHERE id = 'intermediate') THEN
    v_missing := v_missing || 'difficulty_profiles:intermediate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.difficulty_profiles WHERE id = 'expert') THEN
    v_missing := v_missing || 'difficulty_profiles:expert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_categories WHERE slug = 'avatar_frames') THEN
    v_missing := v_missing || 'shop_categories:avatar_frames';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rewarded_ad_reward_definitions WHERE slug = 'retry-token') THEN
    v_missing := v_missing || 'reward_definitions:retry-token';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rewarded_ad_policy WHERE id = 0) THEN
    v_missing := v_missing || 'rewarded_ad_policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'REWARDED_ADS_ENABLED') THEN
    v_missing := v_missing || 'feature_flags:REWARDED_ADS_ENABLED';
  END IF;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PROD_GUARD: missing system rows: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE 'PROD_GUARD: production seed baseline OK (no demo data, system catalog present)';
END;
$$;
