# Shop Security (M16)

RLS is authoritative for reads; **all writes go through role-checked
`SECURITY DEFINER` functions**. No write policies exist on any shop
table.

## Guarantees (all pgTAP + API tested)

- Students cannot create items, edit prices, or activate catalog
  (`FORBIDDEN` / `NOT_DRAFT`).
- Students cannot mint coins: the shop has no credit path; the only
  ledger writer debits under lock.
- Disabled (`INACTIVE`/`NOT_FOUND` via RLS invisibility) and
  out-of-window (`UNAVAILABLE`) items cannot be bought.
- Duplicate requests return the original purchase without a second
  debit (idempotency key + unique constraint + race fallback).
- Negative balances impossible (locked read + dual CHECKs).
- Concurrent purchases serialize on the `profiles` row lock and
  collapse on the idempotency key.
- Clan cosmetics: leader/co-leader only (`fn_is_clan_staff`);
  members rejected; personal/clan scopes cannot cross
  (`MALFORMED` both directions).
- Cross-user inventory invisible (RLS) and unusable (ownership
  proofs raise `NOT_FOUND` — no existence oracle).
- Forged item IDs → `NOT_FOUND`; forged prices/currencies cannot be
  expressed (no such fields); R2 keys restricted to `cosmetics/`
  with safe extensions (traversal rejected).
- Purchase history immutable (trigger); limits server-counted.

## Scope matrix

| Capability | Student | Teacher | Admin | Super admin |
|---|---|---|---|---|
| Browse active catalog | ✅ | ✅ | ✅ | ✅ |
| Buy / equip / use own | ✅ | ❌ | ❌ | ❌ |
| Clan buy/equip | staff only | ❌ | ❌ | ❌ |
| Create/edit/activate | ❌ | ❌ | ✅ | ✅ |
| Read purchase audit | own | ❌ | ✅ | ✅ |
