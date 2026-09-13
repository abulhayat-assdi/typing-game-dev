# Rewarded Ads (M17)

Students may voluntarily view an eligible rewarded ad for a
controlled, non-transferable in-platform reward (retry token, streak
recovery, approved cosmetic). Ads are never required to play; every
flow keeps an ordinary non-ad path.

## Google integration choice

**Google AdSense / Ad Manager Offerwall** (generally available since
2025–2026) is the documented web product: user choice → rewarded ad
→ entitlement, rendered and metered by Google's Privacy & messaging
builder (metering, dismiss rules, consent handling).

Critical consequence, verified against the official docs: **Offerwall
manages the whole choice → ad → entitlement interaction and exposes
no per-completion server callback suitable for custom in-app rewards**
(such as "1 retry token"). Per §7 of the milestone we therefore do
NOT invent a callback:

- What Google entitles (content access) stays Google-managed.
- Custom item/coin/streak grants via Google completion are
  **unverifiable** → implemented as fail-closed (`UNVERIFIABLE`,
  session parked `failed`, nothing granted).
- `GOOGLE_REWARDED_ENABLED` remains `false`; enabling it without a
  documented verification hook changes nothing (verification still
  refuses). No Google approval/eligibility is claimed.

References (current as of implementation):

- AdSense Help: "About Offerwall messages"
  (https://support.google.com/adsense/answer/13865318)
- AdSense Help: "Create an Offerwall message"
  (https://support.google.com/adsense/answer/13866332)
- AdSense announcements: "Offerwall is now generally available"
  (April 2026)
- Google Ads blog: "Offerwall gives publishers more options"
  (June 2025)

## Reward model

Allow-listed definitions only (`retry-token` item,
`streak-recovery-1d`, disabled `welcome-frame`; admins toggle, never
invent). Grants reuse M16 inventory rails and the M5 coin ledger,
exactly once per session (row lock + `rewarded_ad_grants` UNIQUE).

## Coin reward decision (§5)

**Coins are disabled by default** (`allow_coin_rewards = false`,
fail-fast at offer and re-checked at verify/grant). Coins in this
platform are earned progression-adjacent balances; treating them as
ad payouts risks reading as monetary-adjacent value. Until a
compliant indirect-reward reading is explicitly approved, rewards
are non-transferable items/entitlements. The flag exists so the
decision is reversible with full audit, not as a quiet on-ramp.

## Non-transferability

Item grants land in personal inventory (no transfer API exists);
coins cannot be gifted or cashed out (no such functions); streak
recovery rewrites no history. Rewards work only inside this
logged-in platform.

## Feature flags

`REWARDED_ADS_ENABLED=false`, `GOOGLE_REWARDED_ENABLED=false`
(both fail closed). Mock provider is development-only; production
with invalid Google config refuses verification rather than
degrading to trust.

## Local development

`MockRewardProvider` (HMAC-signed completions in `@tap/rewards-ads`
for unit tests; server-echoed opaque references in SQL) drives the
full local smoke loop. It is selected only when policy
`provider='mock'` AND `mock_allowed`, and the UI labels it
development-only. Production must set `mock_allowed=false`.
