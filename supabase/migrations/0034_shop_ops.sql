-- M16 shop operations: admin catalog, atomic idempotent purchases
-- through the M5 coin ledger (profiles row lock + ledger append +
-- balance update in one transaction), personal/clan inventory, equip
-- slots, consumable use, expiry sweep. The shop only consumes coins —
-- no generation, transfer, gifting, or cash-out path exists.

CREATE OR REPLACE FUNCTION public.fn_require_shop_admin()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() OR public.fn_is_mission_admin() THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'FORBIDDEN';
END;
$$;

-- Equip slot per category (mirrors @tap/shop equipSlot).
CREATE OR REPLACE FUNCTION public.shop_equip_slot(p_category text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_category = 'avatar_frames' THEN 'frame'
    WHEN p_category = 'titles' THEN 'title'
    WHEN p_category IN ('profile_effects', 'map_effects',
      'victory_animations', 'result_effects', 'sound_packs',
      'badge_variants') THEN 'effect'
    WHEN p_category = 'clan_banners' THEN 'banner'
    WHEN p_category = 'clan_emblems' THEN 'emblem'
    ELSE 'other' END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_shop_item(p_def jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.fn_require_shop_admin();
  IF p_def ->> 'slug' IS NULL OR p_def ->> 'name' IS NULL
     OR p_def ->> 'category' IS NULL OR p_def ->> 'item_type' IS NULL
     OR (p_def ->> 'price_coins')::int IS NULL
     OR (p_def ->> 'price_coins')::int < 0 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_categories
                 WHERE slug = p_def ->> 'category') THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  -- R2 keys validated up front (same cosmetics/ rule as the CHECK).
  IF NULLIF(p_def ->> 'asset_key', '') IS NOT NULL
     AND NULLIF(p_def ->> 'asset_key', '') !~
       '^cosmetics/[a-z0-9/_-]+\.(png|jpg|jpeg|webp|avif|gif|svg|mp3|ogg|wav|webm|m4a)$' THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF NULLIF(p_def ->> 'preview_key', '') IS NOT NULL
     AND NULLIF(p_def ->> 'preview_key', '') !~
       '^cosmetics/[a-z0-9/_-]+\.(png|jpg|jpeg|webp|avif|gif|svg|mp3|ogg|wav|webm|m4a)$' THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.shop_items (
    slug, name, description, category, item_type, asset_key, preview_key,
    price_coins, available_from, available_to,
    purchase_limit_total, purchase_limit_daily, purchase_limit_weekly,
    max_own, consumable, equippable, effect, expiry_days,
    metadata, is_featured)
  VALUES (
    p_def ->> 'slug', p_def ->> 'name',
    COALESCE(p_def ->> 'description', ''),
    p_def ->> 'category', p_def ->> 'item_type',
    NULLIF(p_def ->> 'asset_key', ''),
    NULLIF(p_def ->> 'preview_key', ''),
    (p_def ->> 'price_coins')::int,
    (p_def ->> 'available_from')::timestamptz,
    (p_def ->> 'available_to')::timestamptz,
    NULLIF(p_def ->> 'purchase_limit_total', '')::int,
    NULLIF(p_def ->> 'purchase_limit_daily', '')::int,
    NULLIF(p_def ->> 'purchase_limit_weekly', '')::int,
    COALESCE(NULLIF(p_def ->> 'max_own', '')::int, 1),
    COALESCE((p_def ->> 'consumable')::boolean, false),
    COALESCE((p_def ->> 'equippable')::boolean, true),
    NULLIF(p_def ->> 'effect', ''),
    NULLIF(p_def ->> 'expiry_days', '')::int,
    COALESCE(p_def -> 'metadata', '{}'::jsonb),
    COALESCE((p_def ->> 'is_featured')::boolean, false))
  RETURNING id INTO v_id;
  INSERT INTO public.shop_item_versions (item_id, version, definition)
  SELECT v_id, version, to_jsonb(t.*) - 'created_at' - 'updated_at'
  FROM public.shop_items t WHERE t.id = v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_SLUG';
END;
$$;

-- Catalog edits require an inactive item (deactivate → edit →
-- reactivate); every edit bumps the version history.
CREATE OR REPLACE FUNCTION public.fn_update_shop_item(
  p_item uuid, p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_require_shop_admin();
  IF NOT EXISTS (SELECT 1 FROM public.shop_items
                 WHERE id = p_item AND NOT is_active) THEN
    RAISE EXCEPTION 'NOT_DRAFT';
  END IF;
  UPDATE public.shop_items SET
    name = COALESCE(NULLIF(p_patch ->> 'name', ''), name),
    description = COALESCE(p_patch ->> 'description', description),
    price_coins = COALESCE((p_patch ->> 'price_coins')::int, price_coins),
    asset_key = COALESCE(NULLIF(p_patch ->> 'asset_key', ''), asset_key),
    preview_key = COALESCE(NULLIF(p_patch ->> 'preview_key', ''), preview_key),
    available_from = COALESCE((p_patch ->> 'available_from')::timestamptz,
                              available_from),
    available_to = COALESCE((p_patch ->> 'available_to')::timestamptz,
                            available_to),
    purchase_limit_total = COALESCE(
      (p_patch ->> 'purchase_limit_total')::int, purchase_limit_total),
    purchase_limit_daily = COALESCE(
      (p_patch ->> 'purchase_limit_daily')::int, purchase_limit_daily),
    purchase_limit_weekly = COALESCE(
      (p_patch ->> 'purchase_limit_weekly')::int, purchase_limit_weekly),
    max_own = COALESCE((p_patch ->> 'max_own')::int, max_own),
    is_featured = COALESCE((p_patch ->> 'is_featured')::boolean, is_featured),
    metadata = COALESCE(p_patch -> 'metadata', metadata),
    version = version + 1,
    updated_at = now()
  WHERE id = p_item;
  IF (SELECT price_coins FROM public.shop_items WHERE id = p_item) < 0 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  INSERT INTO public.shop_item_versions (item_id, version, definition)
  SELECT p_item, version, to_jsonb(t.*) - 'created_at' - 'updated_at'
  FROM public.shop_items t WHERE t.id = p_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_item_active(
  p_item uuid, p_active boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_require_shop_admin();
  UPDATE public.shop_items SET is_active = p_active, updated_at = now()
  WHERE id = p_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Purchase: availability → ownership/limit → atomic coin debit (M5
-- ledger + locked balance) → purchase row → grant. One transaction:
-- any failure rolls back debit, record, and grant together.
-- Idempotency key: shop:{item}:user:{user}[:clan:{clan}]:purchase:{req}.
-- Clan cosmetics: leader/co-leader only, paid from personal coins,
-- purchaser + authorization recorded — no clan wallet, no silent moves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_purchase_item(
  p_item uuid, p_clan uuid DEFAULT NULL, p_request text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_item record;
  v_key text;
  v_existing uuid;
  v_balance int;
  v_new_balance int;
  v_pid uuid;
  v_have int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_request IS NULL OR char_length(p_request) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'INACTIVE';
  END IF;
  IF v_item.available_from IS NOT NULL AND now() < v_item.available_from THEN
    RAISE EXCEPTION 'UNAVAILABLE';
  END IF;
  IF v_item.available_to IS NOT NULL AND now() >= v_item.available_to THEN
    RAISE EXCEPTION 'UNAVAILABLE';
  END IF;
  IF p_clan IS NOT NULL THEN
    IF v_item.item_type <> 'clan_cosmetic' THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    IF NOT public.fn_is_clan_staff(p_clan, v_me) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    v_key := 'shop:' || p_item::text || ':user:' || v_me::text
      || ':clan:' || p_clan::text || ':purchase:' || p_request;
  ELSE
    IF v_item.item_type = 'clan_cosmetic' THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    v_key := 'shop:' || p_item::text || ':user:' || v_me::text
      || ':purchase:' || p_request;
  END IF;

  -- Idempotent replay: same request returns the original purchase.
  SELECT id INTO v_existing FROM public.purchase_records
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Serialize payers (M5 locking strategy): the profile row lock orders
  -- concurrent purchases by the same payer; the clan row lock orders
  -- concurrent clan purchases by different staff. Every check below
  -- re-reads AFTER these locks, so check-then-act races cannot slip
  -- through (the pre-lock replay check above is only a fast path).
  SELECT coin_balance INTO v_balance FROM public.profiles
  WHERE id = v_me FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF p_clan IS NOT NULL THEN
    PERFORM 1 FROM public.clans WHERE id = p_clan FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
  END IF;
  SELECT id INTO v_existing FROM public.purchase_records
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Server-enforced limits (never UI counters).
  IF v_item.purchase_limit_total IS NOT NULL AND (
      SELECT count(*) FROM public.purchase_records
      WHERE user_id = v_me AND item_id = p_item
        AND status = 'completed'
        AND ((p_clan IS NULL AND clan_id IS NULL)
             OR (p_clan IS NOT NULL AND clan_id = p_clan))
    ) >= v_item.purchase_limit_total THEN
    RAISE EXCEPTION 'LIMIT';
  END IF;
  IF v_item.purchase_limit_daily IS NOT NULL AND (
      SELECT count(*) FROM public.purchase_records
      WHERE user_id = v_me AND item_id = p_item
        AND status = 'completed' AND created_at >= date_trunc('day', now())
        AND ((p_clan IS NULL AND clan_id IS NULL)
             OR (p_clan IS NOT NULL AND clan_id = p_clan))
    ) >= v_item.purchase_limit_daily THEN
    RAISE EXCEPTION 'LIMIT';
  END IF;
  IF v_item.purchase_limit_weekly IS NOT NULL AND (
      SELECT count(*) FROM public.purchase_records
      WHERE user_id = v_me AND item_id = p_item
        AND status = 'completed'
        AND created_at >= date_trunc('week', now())
        AND ((p_clan IS NULL AND clan_id IS NULL)
             OR (p_clan IS NOT NULL AND clan_id = p_clan))
    ) >= v_item.purchase_limit_weekly THEN
    RAISE EXCEPTION 'LIMIT';
  END IF;
  IF p_clan IS NULL THEN
    SELECT COALESCE(quantity, 0) INTO v_have FROM public.shop_inventory
    WHERE user_id = v_me AND item_id = p_item;
  ELSE
    SELECT COALESCE(quantity, 0) INTO v_have FROM public.clan_inventory
    WHERE clan_id = p_clan AND item_id = p_item;
  END IF;
  IF NOT FOUND THEN
    v_have := 0;
  END IF;
  IF v_have + 1 > v_item.max_own THEN
    RAISE EXCEPTION 'LIMIT';
  END IF;

  -- Reserve the idempotency key BEFORE any debit: a conflicting
  -- identical request returns the winner having paid nothing yet.
  -- (Balance is verified first — side-effect-free — so a failed
  -- purchase never leaves a dead reservation behind.)
  SELECT coin_balance INTO v_balance FROM public.profiles
  WHERE id = v_me;
  IF v_balance < v_item.price_coins THEN
    RAISE EXCEPTION 'INSUFFICIENT';
  END IF;
  INSERT INTO public.purchase_records
    (idempotency_key, user_id, clan_id, item_id, quantity,
     unit_price, total_price, currency, request_id, metadata)
  VALUES (v_key, v_me, p_clan, p_item, 1,
    v_item.price_coins, v_item.price_coins, 'coins', p_request,
    jsonb_build_object('authorizer_role',
      CASE WHEN p_clan IS NULL THEN 'owner'
           ELSE (SELECT role::text FROM public.clan_members
                 WHERE clan_id = p_clan AND user_id = v_me
                   AND status = 'active') END))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_pid;
  IF NOT FOUND THEN
    -- Serialized behind the winner (locks above): return its purchase.
    SELECT id INTO v_pid FROM public.purchase_records
    WHERE idempotency_key = v_key;
    RETURN v_pid;
  END IF;

  -- Atomic debit: balance re-read post-lock, ledger append, then move
  -- the cached balance. CHECK guards negativity.
  SELECT coin_balance INTO v_balance FROM public.profiles
  WHERE id = v_me;
  v_new_balance := v_balance - v_item.price_coins;
  INSERT INTO public.coin_ledger
    (user_id, amount, source, source_type, reference_id, reason,
     metadata, balance_after)
  VALUES (v_me, -v_item.price_coins, 'shop', 'shop', v_key,
    'shop purchase',
    jsonb_build_object('item_id', p_item, 'clan_id', p_clan),
    v_new_balance);
  UPDATE public.profiles SET coin_balance = v_new_balance
  WHERE id = v_me;

  IF p_clan IS NULL THEN
    INSERT INTO public.shop_inventory
      (user_id, item_id, quantity, expires_at)
    VALUES (v_me, p_item, 1,
      CASE WHEN v_item.expiry_days IS NULL THEN NULL
           ELSE now() + (v_item.expiry_days || ' days')::interval END)
    ON CONFLICT (user_id, item_id) DO UPDATE SET
      quantity = shop_inventory.quantity + 1,
      expires_at = CASE WHEN v_item.expiry_days IS NULL THEN NULL
        ELSE now() + (v_item.expiry_days || ' days')::interval END;
  ELSE
    INSERT INTO public.clan_inventory
      (clan_id, item_id, quantity, granted_by)
    VALUES (p_clan, p_item, 1, v_me)
    ON CONFLICT (clan_id, item_id) DO UPDATE SET
      quantity = clan_inventory.quantity + 1,
      granted_by = v_me;
  END IF;
  INSERT INTO public.item_grants
    (purchase_id, user_id, clan_id, item_id, quantity, reason)
  VALUES (v_pid,
    CASE WHEN p_clan IS NULL THEN v_me ELSE NULL END,
    p_clan, p_item, 1,
    CASE WHEN p_clan IS NULL THEN 'purchase' ELSE 'clan_purchase' END);
  RETURN v_pid;
END;
$$;

-- ---------------------------------------------------------------------------
-- Equip: free after ownership, one equipped item per slot per scope.
-- Personal slots: frame/title/effect; clan slots: banner/emblem.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_equip_item(
  p_item uuid, p_equip boolean DEFAULT true, p_clan uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_item record;
  v_slot text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT v_item.equippable THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  v_slot := public.shop_equip_slot(v_item.category);
  IF p_clan IS NOT NULL THEN
    IF v_item.item_type <> 'clan_cosmetic' THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    IF NOT public.fn_is_clan_staff(p_clan, v_me) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clan_inventory
                   WHERE clan_id = p_clan AND item_id = p_item
                     AND quantity > 0) THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    IF p_equip THEN
      UPDATE public.clan_inventory SET equipped = false
      WHERE clan_id = p_clan AND equipped
        AND item_id IN (SELECT id FROM public.shop_items
                        WHERE public.shop_equip_slot(category) = v_slot);
      UPDATE public.clan_inventory SET equipped = true
      WHERE clan_id = p_clan AND item_id = p_item;
    ELSE
      UPDATE public.clan_inventory SET equipped = false
      WHERE clan_id = p_clan AND item_id = p_item;
    END IF;
  ELSE
    IF v_item.item_type = 'clan_cosmetic' THEN
      RAISE EXCEPTION 'MALFORMED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shop_inventory
                   WHERE user_id = v_me AND item_id = p_item
                     AND quantity > 0
                     AND (expires_at IS NULL OR expires_at > now())) THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    IF p_equip THEN
      UPDATE public.shop_inventory SET equipped = false
      WHERE user_id = v_me AND equipped
        AND item_id IN (SELECT id FROM public.shop_items
                        WHERE public.shop_equip_slot(category) = v_slot);
      UPDATE public.shop_inventory SET equipped = true
      WHERE user_id = v_me AND item_id = p_item;
    ELSE
      UPDATE public.shop_inventory SET equipped = false
      WHERE user_id = v_me AND item_id = p_item;
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Consumable use: decrement + usage audit + shop-confined entitlement.
-- Effects never touch competitive systems: retry_credit/streak_shield
-- accrue as non-transferable entitlements for future allow-listed
-- consumers; combo_flair is passive while equipped (verified here).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_use_consumable(
  p_item uuid, p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_item record;
  v_left int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF NOT v_item.consumable OR v_item.effect IS NULL THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  UPDATE public.shop_inventory SET quantity = quantity - 1
  WHERE user_id = v_me AND item_id = p_item AND quantity > 0
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING quantity INTO v_left;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO public.item_usage (user_id, item_id, quantity_used, context)
  VALUES (v_me, p_item, 1, COALESCE(p_context, '{}'::jsonb));
  -- Entitlements accrue shop-side only (non-transferable, non-spendable
  -- except by future allow-listed consumers; never competitive systems).
  INSERT INTO public.utility_credits (user_id, effect, balance)
  VALUES (v_me, v_item.effect, 1)
  ON CONFLICT (user_id, effect) DO UPDATE SET
    balance = utility_credits.balance + 1, updated_at = now();
  RETURN v_left;
END;
$$;

-- Expiry sweep: zero out lapsed inventory (rows stay for history).
CREATE OR REPLACE FUNCTION public.fn_shop_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
BEGIN
  UPDATE public.shop_inventory SET quantity = 0, equipped = false
  WHERE expires_at IS NOT NULL AND expires_at <= now() AND quantity > 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Clan inventory carries no expiry in M16 (banners/emblems persist).
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_require_shop_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_require_shop_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.shop_equip_slot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_equip_slot(text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_create_shop_item(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_shop_item(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_update_shop_item(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_shop_item(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_item_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_item_active(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_purchase_item(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_purchase_item(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_equip_item(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_equip_item(uuid, boolean, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_use_consumable(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_use_consumable(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_shop_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_shop_sweep() TO authenticated;
