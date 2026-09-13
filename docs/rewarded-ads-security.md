# Rewarded Ads — Security (M17)

RLS is authoritative for reads; **all writes go through role-checked
`SECURITY DEFINER` functions**. No write policies exist on any
rewarded-ads table.

## Guarantees (all pgTAP + API tested)

- Unauthenticated users cannot claim rewards (every fn requires
  `auth.uid()`; routes 401 without session).
- The browser is never trusted: no `{completed: true}` flag is read
  anywhere; completion requires the exact issued
  `provider_reference` inside the session window, owned by the
  caller. Forged references persist `failed` + `verification_failure`
  and report `forged` — the session cannot be probed further.
- Arbitrary rewards impossible: offers accept only enabled
  allow-listed slugs; unknown/disabled/coin (while unapproved)
  definitions fail fast at offer and are re-checked at verify/grant.
- Duplicate callbacks grant once (row lock + `rewarded_ad_grants`
  UNIQUE on `session_id` + grant-key uniqueness; replays return the
  original grant id with a `reward_duplicate` event).
- Expired sessions rejected and parked (`expired` + `no_fill`);
  `fn_rewarded_sweep` reaps strays.
- Wrong-user access is invisible (`NOT_FOUND`, no oracle) at every
  step, including grant.
- Cooldown (default 60 min), daily session cap (5), daily reward cap
  (5) enforced in SQL at offer and re-checked at verify — never
  frontend counters.
- Disabled provider/reward/flag paths refuse (`DISABLED`,
  `INVALID_REWARD`).
- Streak recovery cannot manufacture history: no `streak_events`
  rows are written; state moves forward-only; per-date uniqueness
  blocks replays; policy caps (window, uses, cooldown) enforced.
- Cross-user inventory/ledger reads return zero rows by RLS.

## Copy and conduct rules (implemented, not just documented)

- Explicit opt-in per session; decline/cancel without penalty and
  without blocking normal play (result screen always keeps the
  ordinary retry link).
- Reward stated before opt-in; no support-us/click-to-help language;
  no fake progress theater (mock modal is labeled development-only).
- No click rewards, no impression farming, no transferable or
  monetary rewards.
