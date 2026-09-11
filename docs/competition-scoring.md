# Competition scoring (M8)

Scores are always recomputed server-side from validated M4 attempts; the
client never submits a score. Per competition: one scoring metric
(`scoring.metric`, default `score`), deterministic tie-breakers
(`score, accuracy, wpm, errors, earliest`), one attempt policy
(`BEST_SCORE | BEST_ACCURACY | BEST_WPM | LATEST_VALID | AVERAGE_TOP_3`)
with an attempt limit, mirrored in
`packages/competition/src/scoring.ts` (`competitionValue`,
`selectRepresentative`, `rankEntries`, `aggregateBatch`).

Only attempts in state `validated` attached during `live` count
(`fn_attach_attempt` rejects anything else). Finalize
(`fn_finalize_competition`) ranks participants deterministically
(score desc, then tie-breakers, then ref asc) and writes immutable
`competition_results` rows (`participant` scope; `batch` scope added for
multi-batch competitions). Re-finalize is rejected (`INVALID_STATE`);
reward inserts are idempotent on
`competition:{id}:participant:{user}:reward:v1`.

Live boards show the caller's own row plus status; the full public board
opens at `finalized` (`results_select_final`). The UI board reads the
`fn_competition_leaderboard` projection (rank, display name, batch,
score, WPM, accuracy, attempts, is_me) — no emails, coins, or account
data ever leave the server.
