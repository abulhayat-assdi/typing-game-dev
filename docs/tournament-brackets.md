# Tournament Brackets (M14)

Single elimination is implemented. Double elimination, round robin,
and Swiss are architecture-ready only: accepted by the format enum and
the `planBracket()` hook, rejected with `FORMAT_NOT_YET_IMPLEMENTED`
before any bracket rows could exist.

## Generation (`fn_seed_tournament`, `@tap/tournament/bracket`)

1. `slots = nextPowerOfTwo(N)`; byes = `slots - N`.
2. Canonical seed placement (recursive mirror): 8 slots →
   `[1,8,4,5,2,7,3,6]`, so seed 1 meets seed N and top seeds collect
   the byes.
3. Consecutive placement pairs become round-1 matches; a pair with one
   empty side becomes a `bye` match whose winner is preset and
   propagated into the round-2 slot immediately, with an audit row in
   `tournament_adjustments` (scope `bye`).
4. Later rounds are created empty but wired: `child_match_a/b` point at
   the two feeders, so advancement is a deterministic slot fill.
5. Rounds are named from the final backwards (`Final`, `Semifinals`,
   `Quarterfinals`, `Round of N`).

Same (participants, seeds, config) ⇒ same bracket, in TS and SQL.

## Round progression (`fn_advance_tournament`)

Any `pending` match with both participants present becomes `ready`;
matches with empty slots wait. When every match is
`finalized`/`bye`/`cancelled`, the tournament moves `live →
processing`. The function is idempotent — replays change nothing.

## Finalization (`fn_finalize_tournament`)

Requires `processing` and zero open matches. Champion = final winner,
runner-up = final loser, semifinal losers tied 3rd, earlier exits tied
at `2^(rounds - round) + 1`. Results are inserted once (`ON CONFLICT
DO NOTHING`), a standings snapshot is appended to
`tournament_versions`, and the status seal (`finalized`) makes every
row immutable via `fn_guard_tournament_immutable`.

## Bracket UI

`TournamentBracket` renders the adventure-styled bracket: horizontal
round columns on desktop, vertically stacked rounds on mobile (same
markup, CSS scroll-snap). Each match card shows round, both sides,
score, status, winner (with tie-break note), and highlights the
viewer's own side. `TournamentResults` shows 1st/2nd/tied-3rd after
finalization; historical tournaments stay visible.
