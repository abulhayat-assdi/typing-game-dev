# Inventory (M16)

## Personal vs clan (never mixed)

- `shop_inventory`: one row per `(user_id, item_id)` with quantity
  (stackables), `equipped`, optional `expires_at`.
- `clan_inventory`: one row per `(clan_id, item_id)` with quantity,
  `equipped`, `granted_by`. No expiry in M16 (banners persist).

Reads are scope-separated (`getInventory` vs `getClanInventory`);
grants write exactly one side (`item_grants` enforces xor).

## Equip (`fn_equip_item`)

Free after ownership. One equipped item per slot per scope; slots
mirror `@tap/shop equipSlot`: personal frame/title/effect, clan
banner/emblem. Equipping clears the same slot first (atomic), so
exclusivity holds under concurrency. Clan equip requires
leader/co-leader (`fn_is_clan_staff`); members are rejected.
Consumables and cross-scope items raise `MALFORMED`.

## Consumables (`fn_use_consumable`)

Ownership + quantity + unexpired required; each use decrements,
writes `item_usage` (who/what/how-many/context), and — for
`retry_credit`/`streak_shield` — accrues a shop-confined entitlement
in `utility_credits`. `combo_flair` is passive while equipped.

## Expiry (`fn_shop_sweep`)

Lapsed rows zero out (quantity 0, unequipped) but stay for history;
equip/use check `expires_at` on every call, so expiry is enforced
even between sweeps.

## UI

`/{locale}/inventory` (owned/equipped/charges/expiry with equip/use
controls), `/{locale}/clan/shop` (clan cosmetics + vault with
staff-gated actions).
