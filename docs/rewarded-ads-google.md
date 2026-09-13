# Rewarded Ads — Google Integration (M17)

## Selected product

**AdSense / Ad Manager Offerwall, "Rewarded ad" user choice.**
Configured in Privacy & messaging: sites, page inclusions/exclusions,
metering threshold, dismiss allowance, confirmation copy. Google
serves the choice screen, the ad, and the resulting content
entitlement; publishers configure — never implement — that loop.

## What we integrate

- Placement: Offerwall URL targeting includes the voluntary reward
  surfaces (e.g. `/rewards`), excludes core learning flows.
- Metering/dismiss: Google-side (threshold, 30-day reset, takeover
  suppression) — our server limits (cooldown, daily caps) apply to
  *custom* grants, not to Google's metering.
- Reporting: Google's reporting is the authoritative revenue source;
  our funnel tracks opportunities, not impressions or revenue.

## What we deliberately do NOT integrate

- No custom ad player, no progress theater, no `onAdComplete`
  JavaScript bridge: none is documented for Offerwall web, and
  inventing one would violate policy and the milestone.
- No per-completion server callback: `fn_rewarded_complete` returns
  `unverifiable` for `google_offerwall` and parks the session
  `failed` with a `provider_error` event.
- No claim of account approval, eligibility, or revenue share
  (70/30 splits reported in press apply to Ad Manager accounts and
  are Google's to confirm per account).

## Provider abstraction

`RewardProvider` (`@tap/rewards-ads`): `OfferwallProvider`
(config-holder; `verifyCompletion()` → `{verifiable: false}`) and
`MockRewardProvider` (HMAC-SHA256 completions, dev-only). Swapping
providers changes no economy code: sessions, verification outcomes,
and grants flow through the same tables and fns.

## Production configuration checklist

1. AdSense/Ad Manager account approved; site verified.
2. Offerwall message published for the reward surfaces.
3. `GOOGLE_REWARDED_ENABLED` may be set true for metering/reporting
   alignment — custom grants still fail closed (by design).
4. `mock_allowed=false` in `rewarded_ad_policy`.
5. No secrets in the app: publisher ID is public config; there are
   no provider secrets in this integration.
6. If Google later ships a verifiable completion hook, implement it
   as a third `RewardProvider` + SQL verification branch behind the
   existing flag — no economy changes needed.
