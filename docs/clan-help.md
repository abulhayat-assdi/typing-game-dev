# Clan help (M10)

Controlled support model (chosen: coin cost + capped system XP).
Unlimited direct XP transfer is explicitly rejected as exploitable.

Flow: an active member opens one request at a time
(`fn_create_help_request`: amount 1–50 XP, TTL clamped 1–72h, default
48h). A clanmate contributes (`fn_contribute_help`): the supporter
pays the same amount in coins (a real sink, balance-guarded), and the
system grants the requester that much XP (a bounded, auditable faucet
in `xp_ledger` source `clan_help`). One contribution per supporter per
request (`UNIQUE(request_id, supporter)`).

Server-enforced anti-abuse: per-request max 50, supporter daily spend
100 coins, requester daily intake 50 XP, single open request per
member, no self-fulfill, same-clan-only (cross-clan attempts fail),
expiry sweeps (`fn_expire_help_requests` runs inside create/contribute;
expired requests refuse contributions). Request states:
`open → partially_fulfilled → fulfilled`, plus `expired/cancelled`.
Every open/fulfill/expire writes feed + hook entries. Replays are
idempotent by ledger reference keys
(`help:{request}:from:{supporter}:v1`, `help:{request}:to:{…}:v1`).
