# Competition lifecycle (M8)

`draft → scheduled → registration_open → registration_closed → live →
ended → processing → finalized`, with `cancelled` from most states and an
optional `paused` hold. Terminal: `finalized`, `cancelled`. Mirrored in
`packages/competition/src/lifecycle.ts` (`canTransitionStatus`,
`acceptsRegistration`, `acceptsAttempts`) and enforced again in
`fn_transition_competition` — the client can never request an arbitrary
status because each API endpoint encodes exactly one hop
(`.../publish|open|close|finalize`).

Every hop writes `competition_state_events` (actor, from/to). Drafts are
editable via `fn_update_competition_draft` (title, description,
eligibility, scoring, attempts, rewards, schedule, games); non-drafts
reject with `NOT_DRAFT`, and finalized result rows are immutable
(`competition_results` has no staff UPDATE path — corrections go through
`fn_record_adjustment`, which preserves old/new in
`competition_adjustments`).

Future clan-war extension: multi-batch aggregation already exists
(`comp_batch_aggregate`: SUM/AVERAGE/TOP_N/AVERAGE_TOP_N/BEST_PLAYER/
PARTICIPATION_WEIGHTED, used when eligibility spans >1 batch). Clan wars
reuse this path with `type='CLAN_WAR'` and clan-scoped entries — no new
results tables needed.
