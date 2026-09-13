# Shop Economy (M16)

## The one rule

Coins are earned only through the M5 economy. The shop **consumes**
coins and creates nothing spendable:

- No coin generation, transfer, gifting, cash-out, real-money
  purchase, or exchange path exists — there is simply no function
  or route for any of them.
- Debits append negative rows to `coin_ledger`
  (`source = 'shop'`, idempotency key as `reference_id`) and move
  `profiles.coin_balance` under row lock; both `CHECK (balance >= 0)`
  constraints make negative balances impossible even under races.
- `utility_credits` is **not** a currency: non-transferable,
  non-convertible, single-purpose entitlement counters for
  consumable effects. No wallet, no exchange, no cash value.

## Utility bounds

`utility` items cap at `max_own ≤ 5` (DB + TS), carry one documented
effect (`retry_credit`, `streak_shield`, `combo_flair`), and are
never equippable when consumable. Effects accrue shop-side
entitlements only — competitive systems (scoring, streaks, wars,
tournaments, seasons) are untouched, so no unbounded advantage can
arise. Future consumers must join an explicit allow-list; until
then, credits are inert by design, not by accident.

## Clan purchases without a wallet

Clan cosmetics are paid from the purchasing leader/co-leader's
**personal** coins. The purchase row records purchaser, clan, price,
and authorizer role (`leader`/`co_leader` at purchase time). No coins
move between balances silently — the only balance movement in the
system is the payer's own debit.

## Audit

`purchase_records` are append-only (trigger rejects UPDATE/DELETE),
`item_grants` trace every credit to a purchase, `item_usage` traces
every consumption. Admins read history; nobody rewrites it.
