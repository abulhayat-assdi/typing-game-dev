# Clan war scoring (M11)

Submissions reference M4 attempts (`clan_war_attempts` holds the link,
never a copy): war must be live, submitter a frozen eligible
participant, attempt validated + owned + inside
`[battle_start, battle_end)`, game in the war pool, per-player cap
respected, attempt never before submitted. Rejected, expired,
off-window and foreign attempts fail with distinct codes.

Player policy (`best_score | best_wpm | best_accuracy | sum`) reduces
each member's submissions to one number; clan mode (`sum | top_n |
average`) aggregates it. Ties break deterministically by stored rule:
total → accuracy → best → participation → earliest. `fn_sync_war`
recomputes contributions any time (read-only); `fn_finalize_war`
writes immutable `clan_war_results` (rank, winner) once, then pays:
contributors earn participation XP/coins, winning-clan contributors
additionally earn the winner bonus — all under
`war:{warId}:member:{userId}:reward:v1`, never twice. Re-finalize
returns the sealed result.

War score is independent of ordinary clan contribution: validated war
attempts still mint normal `clan_contributions` exactly once via the
M10 trigger, while war totals derive from `clan_war_attempts` — the
two are different lenses over the same play, documented here so a
future war-bonus multiplier has a clean seam. The board
(`fn_war_board`) shows clan totals plus own-clan rows and opponent
top-5 only.
