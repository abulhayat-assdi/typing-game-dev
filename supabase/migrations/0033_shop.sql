-- M16 clan shop: cosmetic/controlled-utility catalog over the M5
-- coin ledger (the only currency authority — no new currency, no
-- wallet, no mint, no transfers). Personal and clan inventories stay
-- separate. Assets live in R2 (cosmetics/ keys only); Postgres stores
-- keys, never media.

CREATE TABLE IF NOT EXISTS public.shop_categories (
  slug text PRIMARY KEY CHECK (slug IN (
    'avatar_frames', 'profile_effects', 'titles', 'badge_variants',
    'clan_banners', 'clan_emblems', 'map_effects', 'victory_animations',
    'result_effects', 'sound_packs', 'utility')),
  name_en text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO public.shop_categories (slug, name_en, name_bn, sort_order)
VALUES
  ('avatar_frames', 'Avatar Frames', 'অবতার ফ্রেম', 1),
  ('profile_effects', 'Profile Effects', 'প্রোফাইল এফেক্ট', 2),
  ('titles', 'Titles', 'উপাধি', 3),
  ('badge_variants', 'Badge Variants', 'ব্যাজ', 4),
  ('clan_banners', 'Clan Banners', 'ক্ল্যান ব্যানার', 5),
  ('clan_emblems', 'Clan Emblems', 'ক্ল্যান প্রতীক', 6),
  ('map_effects', 'Map Effects', 'ম্যাপ এফেক্ট', 7),
  ('victory_animations', 'Victory Animations', 'বিজয় অ্যানিমেশন', 8),
  ('result_effects', 'Result-Screen Effects', 'ফলাফল এফেক্ট', 9),
  ('sound_packs', 'Sound Packs', 'সাউন্ড প্যাক', 10),
  ('utility', 'Utility', 'ইউটিলিটি', 11)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  category text NOT NULL REFERENCES public.shop_categories (slug)
    ON DELETE RESTRICT,
  item_type text NOT NULL
    CHECK (item_type IN ('cosmetic', 'profile', 'clan_cosmetic', 'utility')),
  -- R2 keys only (validated); media never lands in Postgres.
  asset_key text CHECK (asset_key IS NULL OR asset_key ~
    '^cosmetics/[a-z0-9/_-]+\.(png|jpg|jpeg|webp|avif|gif|svg|mp3|ogg|wav|webm|m4a)$'),
  preview_key text CHECK (preview_key IS NULL OR preview_key ~
    '^cosmetics/[a-z0-9/_-]+\.(png|jpg|jpeg|webp|avif|gif|svg|mp3|ogg|wav|webm|m4a)$'),
  price_coins int NOT NULL CHECK (price_coins >= 0),
  currency text NOT NULL DEFAULT 'coins' CHECK (currency = 'coins'),
  is_active boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  available_from timestamptz,
  available_to timestamptz,
  purchase_limit_total int CHECK (purchase_limit_total IS NULL OR purchase_limit_total >= 1),
  purchase_limit_daily int CHECK (purchase_limit_daily IS NULL OR purchase_limit_daily >= 1),
  purchase_limit_weekly int CHECK (purchase_limit_weekly IS NULL OR purchase_limit_weekly >= 1),
  max_own int NOT NULL DEFAULT 1 CHECK (max_own >= 1 AND max_own <= 99),
  -- Utility rails: consumables carry a documented effect and are never
  -- equippable; equippables are never consumable.
  consumable boolean NOT NULL DEFAULT false,
  equippable boolean NOT NULL DEFAULT true,
  effect text CHECK (effect IS NULL OR effect IN (
    'retry_credit', 'streak_shield', 'combo_flair')),
  expiry_days int CHECK (expiry_days IS NULL OR expiry_days >= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_from IS NULL OR available_to IS NULL
         OR available_to > available_from),
  CONSTRAINT shop_items_consumable_rule CHECK (
    (consumable AND NOT equippable AND effect IS NOT NULL)
    OR (NOT consumable)),
  CONSTRAINT shop_items_utility_stack CHECK (
    item_type <> 'utility' OR max_own <= 5),
  CONSTRAINT shop_items_clan_scope CHECK (
    (item_type = 'clan_cosmetic'
     AND category IN ('clan_banners', 'clan_emblems'))
    OR (item_type <> 'clan_cosmetic'
        AND category NOT IN ('clan_banners', 'clan_emblems')))
);

CREATE TABLE IF NOT EXISTS public.shop_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.shop_items (id) ON DELETE CASCADE,
  version int NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, version)
);

-- Personal inventory: one row per (user, item); quantity for stacks.
CREATE TABLE IF NOT EXISTS public.shop_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items (id) ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  equipped boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'purchase',
  UNIQUE (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS shop_inventory_user_idx
  ON public.shop_inventory (user_id);

-- Clan inventory: owned by the clan, never mixed with personal rows.
CREATE TABLE IF NOT EXISTS public.clan_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id uuid NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items (id) ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  equipped boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clan_id, item_id)
);

-- Immutable purchase ledger (append-only; guarded by trigger).
CREATE TABLE IF NOT EXISTS public.purchase_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  clan_id uuid REFERENCES public.clans (id) ON DELETE SET NULL,
  item_id uuid NOT NULL REFERENCES public.shop_items (id) ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity = 1),
  unit_price int NOT NULL CHECK (unit_price >= 0),
  total_price int NOT NULL CHECK (total_price >= 0),
  currency text NOT NULL DEFAULT 'coins' CHECK (currency = 'coins'),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'refunded')),
  request_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_user_idx
  ON public.purchase_records (user_id, created_at DESC);

-- Grant audit (every inventory credit traced to a cause).
CREATE TABLE IF NOT EXISTS public.item_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES public.purchase_records (id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  clan_id uuid REFERENCES public.clans (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items (id) ON DELETE RESTRICT,
  quantity int NOT NULL CHECK (quantity >= 1),
  reason text NOT NULL DEFAULT 'purchase',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL AND clan_id IS NULL)
         OR (user_id IS NULL AND clan_id IS NOT NULL))
);

-- Consumable usage log (bounded effects, audited per use).
CREATE TABLE IF NOT EXISTS public.item_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.shop_items (id) ON DELETE RESTRICT,
  quantity_used int NOT NULL DEFAULT 1 CHECK (quantity_used >= 1),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shop-confined entitlement counters (NOT currency: non-transferable,
-- non-convertible, single-purpose credits for consumable effects).
CREATE TABLE IF NOT EXISTS public.utility_credits (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('retry_credit', 'streak_shield', 'combo_flair')),
  balance int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, effect)
);

-- Purchase rows are append-only (refunds are compensating rows, and
-- even those only via a future milestone — nothing updates in M16).
CREATE OR REPLACE FUNCTION public.fn_guard_purchase_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_immutable ON public.purchase_records;
CREATE TRIGGER guard_purchase_immutable
BEFORE UPDATE OR DELETE ON public.purchase_records
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_purchase_immutable();

-- ---------------------------------------------------------------------------
-- RLS: active catalog readable; inventories/purchases own-read (clan
-- inventory to clan viewers); admins read all for audit. No client
-- writes — every mutation is a role-checked SECURITY DEFINER fn.
-- ---------------------------------------------------------------------------
ALTER TABLE public.shop_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_categories_select ON public.shop_categories;
DROP POLICY IF EXISTS shop_items_select ON public.shop_items;
DROP POLICY IF EXISTS shop_items_admin ON public.shop_items;
DROP POLICY IF EXISTS shop_versions_admin ON public.shop_item_versions;
DROP POLICY IF EXISTS shop_inventory_own ON public.shop_inventory;
DROP POLICY IF EXISTS clan_inventory_view ON public.clan_inventory;
DROP POLICY IF EXISTS purchase_own ON public.purchase_records;
DROP POLICY IF EXISTS purchase_admin ON public.purchase_records;
DROP POLICY IF EXISTS grants_own ON public.item_grants;
DROP POLICY IF EXISTS usage_own ON public.item_usage;
DROP POLICY IF EXISTS credits_own ON public.utility_credits;

CREATE POLICY shop_categories_select ON public.shop_categories
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY shop_items_select ON public.shop_items
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY shop_items_admin ON public.shop_items
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());
CREATE POLICY shop_versions_admin ON public.shop_item_versions
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());
CREATE POLICY shop_inventory_own ON public.shop_inventory
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY clan_inventory_view ON public.clan_inventory
  FOR SELECT TO authenticated USING (public.fn_is_clan_viewer(clan_id));
CREATE POLICY purchase_own ON public.purchase_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY purchase_admin ON public.purchase_records
  FOR SELECT TO authenticated
  USING (public.fn_is_mission_admin() OR public.is_super_admin());
CREATE POLICY grants_own ON public.item_grants
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR (clan_id IS NOT NULL AND public.fn_is_clan_viewer(clan_id)));
CREATE POLICY usage_own ON public.item_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY credits_own ON public.utility_credits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
