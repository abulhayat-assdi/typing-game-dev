-- M16 pgTAP suite: shop catalog, atomic idempotent purchases,
-- inventory/equip, consumables, expiry, clan cosmetics, R2 keys,
-- audit, security. BEGIN/ROLLBACK.
--
-- Harness order: bootstrap → migrations → seed (org/batches) → file.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

INSERT INTO auth.users (id, email) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 's16lead@example.com'),
  ('c1c1c1c1-0000-0000-0000-000000000003', 's16mem@example.com'),
  ('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com'),
  ('c1c1c1c1-0000-0000-0000-000000000005', 's16x@example.com');

INSERT INTO public.profiles (id, email, full_name, timezone) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com', 'Admin', 'UTC'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 's16lead@example.com', 'Leader', 'UTC'),
  ('c1c1c1c1-0000-0000-0000-000000000003', 's16mem@example.com', 'Member', 'UTC'),
  ('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com', 'Student', 'UTC'),
  ('c1c1c1c1-0000-0000-0000-000000000005', 's16x@example.com', 'Outsider', 'UTC');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 'super_admin'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 'student'),
  ('c1c1c1c1-0000-0000-0000-000000000003', 'student'),
  ('c1c1c1c1-0000-0000-0000-000000000004', 'student'),
  ('c1c1c1c1-0000-0000-0000-000000000005', 'student');

-- Isolated clan: own course + batch under the seed org.
RESET ROLE;
INSERT INTO public.courses (id, organization_id, title, slug) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000010',
   '11111111-1111-1111-1111-111111111111', 'Shop Course', 'shop-course')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.batches (id, course_id, name, join_code, is_active) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000011',
   'c1c1c1c1-0000-0000-0000-000000000010', 'Shop Batch', 'SHOP-1', true)
ON CONFLICT (id) DO NOTHING;
-- Clan auto-created by trg_batches_clan; adopt it for the test.
INSERT INTO public.clan_members (clan_id, user_id, role, status) VALUES
  ((SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'),
   'c1c1c1c1-0000-0000-0000-000000000002', 'leader', 'active'),
  ((SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'),
   'c1c1c1c1-0000-0000-0000-000000000003', 'member', 'active')
ON CONFLICT (clan_id, user_id) DO NOTHING;
-- Fund wallets (owner bypass; the shop itself can never mint).
INSERT INTO public.coin_ledger
  (user_id, amount, source, source_type, reference_id, reason,
   metadata, balance_after)
VALUES
  ('c1c1c1c1-0000-0000-0000-000000000002', 500, 'test', 'test',
   's16-fund-lead', 'fixture', '{}', 500),
  ('c1c1c1c1-0000-0000-0000-000000000003', 50, 'test', 'test',
   's16-fund-mem', 'fixture', '{}', 50),
  ('c1c1c1c1-0000-0000-0000-000000000004', 500, 'test', 'test',
   's16-fund-stu', 'fixture', '{}', 500)
ON CONFLICT (user_id, source, reference_id) DO NOTHING;
UPDATE public.profiles SET coin_balance = 500
WHERE id IN ('c1c1c1c1-0000-0000-0000-000000000002',
             'c1c1c1c1-0000-0000-0000-000000000004');
UPDATE public.profiles SET coin_balance = 50
WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003';

SELECT plan(67);

SET ROLE authenticated;
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com');

-- ---------------------------------------------------------------------------
-- Catalog: admin create/update/activate, student forbidden, R2 keys.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com');
SELECT throws_ok(
  $$SELECT public.fn_create_shop_item(
    '{"slug":"hack","name":"Hack","category":"titles","item_type":"profile","price_coins":1}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'students cannot create items');
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'gold-frame', 'name', 'Gold Frame',
      'category', 'avatar_frames', 'item_type', 'cosmetic',
      'asset_key', 'cosmetics/gold-frame/frame.png',
      'preview_key', 'cosmetics/gold-frame/preview.png',
      'price_coins', 100)))$$,
  'admin creates a cosmetic');
SELECT throws_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'gold-frame', 'name', 'Dup',
      'category', 'avatar_frames', 'item_type', 'cosmetic',
      'price_coins', 100)))$$,
  'P0001', 'DUPLICATE_SLUG',
  'duplicate slugs rejected');
SELECT throws_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'evil', 'name', 'Evil',
      'category', 'titles', 'item_type', 'profile',
      'asset_key', '../escape.png', 'price_coins', 10)))$$,
  'P0001', 'MALFORMED',
  'traversal asset keys rejected');
SELECT throws_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'wrong', 'name', 'Wrong',
      'category', 'titles', 'item_type', 'profile',
      'asset_key', 'avatars/x.png', 'price_coins', 10)))$$,
  'P0001', 'MALFORMED',
  'non-cosmetics asset keys rejected');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'silver-frame', 'name', 'Silver Frame',
      'category', 'avatar_frames', 'item_type', 'cosmetic',
      'price_coins', 60)))$$,
  'admin creates a second frame');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'scholar', 'name', 'Scholar',
      'category', 'titles', 'item_type', 'profile', 'price_coins', 50)))$$,
  'admin creates a title');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'war-banner', 'name', 'War Banner',
      'category', 'clan_banners', 'item_type', 'clan_cosmetic',
      'price_coins', 200)))$$,
  'admin creates a clan banner');
SELECT throws_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'odd-banner', 'name', 'Odd',
      'category', 'titles', 'item_type', 'clan_cosmetic',
      'price_coins', 10)))$$,
  '23514', 'new row for relation "shop_items" violates check constraint "shop_items_clan_scope"',
  'clan types stay in clan categories');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'retry-token', 'name', 'Retry Token',
      'category', 'utility', 'item_type', 'utility',
      'price_coins', 30, 'max_own', 3, 'consumable', true,
      'equippable', false, 'effect', 'retry_credit')))$$,
  'admin creates a bounded utility consumable');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'one-only', 'name', 'One Only',
      'category', 'titles', 'item_type', 'profile',
      'price_coins', 10, 'purchase_limit_total', 1)))$$,
  'admin creates a one-time item');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'daily-deal', 'name', 'Daily Deal',
      'category', 'titles', 'item_type', 'profile',
      'price_coins', 5, 'purchase_limit_daily', 1)))$$,
  'admin creates a daily-capped item');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'sleepy', 'name', 'Sleepy',
      'category', 'titles', 'item_type', 'profile',
      'price_coins', 5)))$$,
  'admin creates an inactive-by-default item');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'future-fit', 'name', 'Future Fit',
      'category', 'avatar_frames', 'item_type', 'cosmetic',
      'price_coins', 5,
      'available_from', now() + interval '1 day')))$$,
  'admin creates a future-window item');
SELECT lives_ok(
  $$SELECT public.fn_create_shop_item(
    (SELECT jsonb_build_object('slug', 'fading', 'name', 'Fading Dye',
      'category', 'profile_effects', 'item_type', 'cosmetic',
      'price_coins', 20, 'expiry_days', 30)))$$,
  'admin creates an expiring item');
SELECT public.fn_update_shop_item(
  (SELECT id FROM public.shop_items WHERE slug = 'scholar'),
  '{"price_coins": 40}'::jsonb);
SELECT is(price_coins, 40, 'draft price updates')
FROM public.shop_items WHERE slug = 'scholar';
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'silver-frame'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'scholar'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'war-banner'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'retry-token'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'one-only'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'daily-deal'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'future-fit'), true);
SELECT public.fn_set_item_active(
  (SELECT id FROM public.shop_items WHERE slug = 'fading'), true);
SELECT throws_ok(
  $$SELECT public.fn_update_shop_item(
    (SELECT id FROM public.shop_items WHERE slug = 'scholar'),
    '{"price_coins": 1}'::jsonb)$$,
  'P0001', 'NOT_DRAFT',
  'active items reject edits (deactivate first)');

-- ---------------------------------------------------------------------------
-- Purchase: valid, replay, limits, balance, windows, forged IDs.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'),
    NULL, 'req-1') IS NOT NULL,
  'valid purchase succeeds');
SELECT is(coin_balance, 400, 'coins debited exactly once')
FROM public.profiles
WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004';
SELECT is(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'),
    NULL, 'req-1'),
  (SELECT id FROM public.purchase_records
   WHERE idempotency_key LIKE '%req-1'),
  'replay returns the original purchase');
SELECT is(coin_balance, 400, 'replay does not double-charge')
FROM public.profiles
WHERE id = 'c1c1c1c1-0000-0000-0000-000000000004';
SELECT is(quantity, 1, 'item granted to inventory')
FROM public.shop_inventory
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'gold-frame');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'),
    NULL, 'req-2')$$,
  'P0001', 'LIMIT',
  'second copy blocked by max_own');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'one-only'),
    NULL, 'req-a') IS NOT NULL,
  'one-time item first purchase succeeds');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'one-only'),
    NULL, 'req-b')$$,
  'P0001', 'LIMIT',
  'one-time item second purchase blocked');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'daily-deal'),
    NULL, 'req-c') IS NOT NULL,
  'daily-capped first purchase succeeds');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'daily-deal'),
    NULL, 'req-d')$$,
  'P0001', 'LIMIT',
  'daily cap enforced server-side');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'sleepy'),
    NULL, 'req-e')$$,
  'P0001', 'NOT_FOUND',
  'disabled items invisible and unbuyable to students');
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'sleepy'),
    NULL, 'req-e2')$$,
  'P0001', 'INACTIVE',
  'disabled items rejected even for admins');
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'future-fit'),
    NULL, 'req-f')$$,
  'P0001', 'UNAVAILABLE',
  'out-of-window items cannot be purchased');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    '00000000-0000-0000-0000-000000000000'::uuid, NULL, 'req-g')$$,
  'P0001', 'NOT_FOUND',
  'forged item IDs rejected');
SELECT is(count(*)::int, 0, 'every purchase is priced in coins')
FROM public.purchase_records WHERE currency <> 'coins';
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000003', 's16mem@example.com');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'),
    NULL, 'req-poor')$$,
  'P0001', 'INSUFFICIENT',
  'insufficient balance rejected without debit');
SELECT is(coin_balance, 50, 'failed purchase leaves balance intact')
FROM public.profiles
WHERE id = 'c1c1c1c1-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Equip: ownership, slot exclusivity, unequip, clan authorization.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com');
SELECT lives_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'), true)$$,
  'owned frame equips for free');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'silver-frame'),
    NULL, 'req-silver') IS NOT NULL,
  'second frame purchased');
SELECT lives_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'silver-frame'), true)$$,
  'second frame equips');
SELECT is(count(*)::int, 1, 'one frame equipped per slot')
FROM public.shop_inventory
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004' AND equipped;
SELECT lives_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'silver-frame'), false)$$,
  'unequip works');
SELECT throws_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'war-banner'), true)$$,
  'P0001', 'MALFORMED',
  'clan items cannot equip personally');
SELECT throws_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'retry-token'), true)$$,
  'P0001', 'MALFORMED',
  'consumables cannot equip');
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000005', 's16x@example.com');
SELECT throws_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'), true)$$,
  'P0001', 'NOT_FOUND',
  'cross-user equip rejected');
SELECT is(count(*)::int, 0, 'cross-user inventory invisible')
FROM public.shop_inventory
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004';

-- ---------------------------------------------------------------------------
-- Consumables: bounded stacks, audited use, shop-side entitlements.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'retry-token'),
    NULL, 'req-r1') IS NOT NULL,
  'retry token purchased');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'retry-token'),
    NULL, 'req-r2') IS NOT NULL,
  'retry token stacks to two');
SELECT is(
  public.fn_use_consumable(
    (SELECT id FROM public.shop_items WHERE slug = 'retry-token'),
    '{"note":"practice"}'::jsonb),
  1, 'first use decrements to one');
SELECT is(count(*)::int, 1, 'usage audited')
FROM public.item_usage
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'retry-token');
SELECT is(balance, 1, 'retry credit accrues shop-side only')
FROM public.utility_credits
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004'
  AND effect = 'retry_credit';
SELECT is(
  public.fn_use_consumable(
    (SELECT id FROM public.shop_items WHERE slug = 'retry-token')),
  0, 'second use empties the stack');
SELECT throws_ok(
  $$SELECT public.fn_use_consumable(
    (SELECT id FROM public.shop_items WHERE slug = 'retry-token'))$$,
  'P0001', 'NOT_FOUND',
  'empty stack cannot be used');

-- ---------------------------------------------------------------------------
-- Expiry: lapsed inventory zeroes via sweep, rows stay for history.
-- ---------------------------------------------------------------------------
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'fading'),
    NULL, 'req-fade') IS NOT NULL,
  'expiring item purchased');
RESET ROLE;
UPDATE public.shop_inventory SET expires_at = now() - interval '1 hour'
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'fading');
SET ROLE authenticated;
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com');
SELECT ok(public.fn_shop_sweep() >= 1, 'sweep zeroes lapsed inventory');
SELECT is(quantity, 0, 'lapsed row kept at zero for history')
FROM public.shop_inventory
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000004'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'fading');

-- ---------------------------------------------------------------------------
-- Clan cosmetics: staff-only, personal-coins, recorded authorization.
-- No clan wallet exists or moves.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000003', 's16mem@example.com');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'war-banner'),
    (SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'), 'req-clan-no')$$,
  'P0001', 'FORBIDDEN',
  'ordinary members cannot buy clan cosmetics');
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000002', 's16lead@example.com');
SELECT ok(
  public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'war-banner'),
    (SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'), 'req-clan-yes') IS NOT NULL,
  'leader buys the clan banner');
SELECT is(quantity, 1, 'banner lands in clan inventory (never personal)')
FROM public.clan_inventory
WHERE clan_id = (SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011')
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'war-banner');
SELECT is(count(*)::int, 0, 'banner never leaks to personal inventory')
FROM public.shop_inventory
WHERE user_id = 'c1c1c1c1-0000-0000-0000-000000000002'
  AND item_id = (SELECT id FROM public.shop_items WHERE slug = 'war-banner');
SELECT is(coin_balance, 300, 'leader pays from personal coins')
FROM public.profiles
WHERE id = 'c1c1c1c1-0000-0000-0000-000000000002';
SELECT is(metadata ->> 'authorizer_role', 'leader', 'authorization recorded')
FROM public.purchase_records
WHERE idempotency_key LIKE '%req-clan-yes';
SELECT lives_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'war-banner'), true,
    (SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'))$$,
  'leader equips the clan banner');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'war-banner'),
    NULL, 'req-clan-solo')$$,
  'P0001', 'MALFORMED',
  'clan items cannot be bought personally');
SELECT throws_ok(
  $$SELECT public.fn_purchase_item(
    (SELECT id FROM public.shop_items WHERE slug = 'gold-frame'),
    (SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'), 'req-clan-wrong')$$,
  'P0001', 'MALFORMED',
  'personal items cannot be bought for the clan');
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000003', 's16mem@example.com');
SELECT throws_ok(
  $$SELECT public.fn_equip_item(
    (SELECT id FROM public.shop_items WHERE slug = 'war-banner'), true,
    (SELECT id FROM public.clans WHERE batch_id = 'c1c1c1c1-0000-0000-0000-000000000011'))$$,
  'P0001', 'FORBIDDEN',
  'members cannot equip clan cosmetics');

-- ---------------------------------------------------------------------------
-- Audit: purchases immutable, ledgers consistent, no negative balances.
-- ---------------------------------------------------------------------------
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com');
RESET ROLE;
SELECT throws_ok(
  $$UPDATE public.purchase_records SET total_price = 0
    WHERE idempotency_key LIKE '%req-1'$$,
  'P0001', 'IMMUTABLE',
  'purchase history cannot be rewritten');
SET ROLE authenticated;
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000001', 's16a@example.com');
SELECT is(count(*)::int, 0, 'negative balances impossible')
FROM public.profiles WHERE coin_balance < 0;
SELECT is(count(*)::int, 0, 'ledger never goes negative')
FROM public.coin_ledger WHERE balance_after < 0;
SELECT ok(count(*)::int >= 8, 'purchase audit trail complete')
FROM public.purchase_records;
SELECT tests.set_claims('c1c1c1c1-0000-0000-0000-000000000004', 's16stu@example.com');
SELECT ok(count(*)::int >= 7, 'grant audit trail complete')
FROM public.item_grants;

SELECT * FROM finish();
ROLLBACK;
