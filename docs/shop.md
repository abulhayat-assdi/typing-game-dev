# Clan Shop (M16)

The Guild Market sells cosmetics and bounded utilities for M5 coins.
Catalog, pricing, purchase, inventory, and equip live here; currency,
wallets, and progression stay in M5.

## Catalog (`shop_categories`, `shop_items`, `shop_item_versions`)

Types: `cosmetic`, `profile`, `clan_cosmetic`, `utility`. Categories
cover avatar frames, profile effects, titles, badge variants, clan
banners/emblems, map/victory/result effects, sound packs, and utility.
Clan categories are exclusive to `clan_cosmetic` items (DB CHECK +
TS validation agree).

Each item: slug, name, description, category, type, R2 `asset_key` /
`preview_key` (`cosmetics/` only, regex-validated up front),
`price_coins`, `currency = 'coins'` (fixed), active flag,
availability window, total/daily/weekly limits, `max_own`,
consumable/equippable/effect rails, optional `expiry_days`,
`featured`, version history. Items are created inactive; edits
require deactivation (version bumped per edit); activation is a
separate audited step with emergency-disable semantics.

## Purchase (`fn_purchase_item`)

Availability → ownership/limit checks → locked M5 debit → purchase
row → grant, in one transaction. Prices come from the database row —
no price field exists on the API, so forged prices are structurally
impossible. Idempotency key
`shop:{item}:user:{user}[:clan:{clan}]:purchase:{request}` makes
replays return the original purchase; races collapse on the unique
key. Limits (total/daily/weekly/max_own) are counted server-side.

## API / UI

- `GET /api/shop`, `GET /api/shop/[id]`,
  `POST /api/shop/[id]/purchase` (`requestId`, optional `clanId`).
- Admin: `/api/admin/shop` (list/create),
  `/api/admin/shop/[id]/{update,activate,deactivate}`.
- Pages: `/{locale}/shop` (featured, category filter, search),
  `/shop/[id]` (preview, confirm purchase),
  `/{locale}/admin/shop[/new|/[id]]`.
- Domain mirror: `@tap/shop` (validation, keys, slots).

## Future rewarded-ads integration

Ads (later milestone) may *grant* existing catalog items or coins
through `item_grants`/the M5 ledger with `source = 'rewarded_ad'`.
No schema change needed: ads become another grant reason, purchases
stay coin-only. Real-money rails remain out of scope.
