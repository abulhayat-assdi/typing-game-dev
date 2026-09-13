# Rewarded Ads — Economy (M17)

## Reuse, not reinvention

- Items: M16 `shop_inventory` upserts (respecting `max_own`) +
  `item_grants` rows with `reason = 'rewarded_ad'`, `purchase_id =
  NULL`. No shop code changed.
- Coins: M5 `coin_ledger` appends (`source = 'rewarded_ad'`,
  idempotency key as `reference_id`) + locked balance move — **only
  when `allow_coin_rewards` is explicitly enabled** (default false;
  see `rewarded-ads.md` §5 for the policy reasoning).
- Streak recovery: bounded `streaks.last_active_date` repair plus
  `streak_recoveries` audit rows. No `streak_events` inserts, no
  calculator changes, no `active_days` edits.

## What does not exist (by design)

No second wallet, no ad-coin, no transfers, no gifting, no cash-out,
no click payouts, no mandatory-ad gates on learning, no
user-to-user ad rewards. `utility_credits` from M16 are untouched.

## Recovery policy (configurable, no hard-coded ratios)

`recovery_max_days` (2), `recovery_ads_per_day` (1),
`recovery_window_days` (3), `recovery_cooldown_hours` (24),
`recovery_max_uses` (4). Each grant repairs up to `ads_per_day`
most-recent uncovered lapsed dates within `max_days`, only inside
the window, only forward, each date once ever. Admin-tunable via
`fn_set_rewarded_policy`; students see outcomes, never knobs.

## Analytics vs revenue

The app funnel (`opportunity_shown → … → reward_granted`,
`no_fill`, failures, duplicates) measures experience health and
abuse — never revenue. A reward event is not an impression; only
Google reporting speaks to revenue.
