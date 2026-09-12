# Season rewards (M13)

Configurable per season (`reward_policy.individual`):
first/second/third/participation XP and coins, all defaulted
(500/300/200/20 XP, 50/30/20/2 coins). Balances are never touched
directly — rewards flow through the M5 ledgers under
`season:{season}:participant:{user}:final:v1`, guarded by the same
insert-if-absent + balance-update-if-ledger-row pattern as every other
milestone. Clan results carry tiers and honor records, never ledger
movement (there are no clan balances to move).

Tiers (Bronze/Silver/Gold/Platinum/Diamond/Legend suggested) derive
from points (and optional rank gates) at board time and again at
finalize; they reset every season and are never stored on profiles.
Corrections after finalization are audit-only rows in
`season_adjustments` — results, points and rankings stay sealed.
