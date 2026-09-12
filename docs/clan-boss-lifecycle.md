# Clan boss lifecycle (M12)

Definitions move `draft → active` (versioned snapshots on every draft
edit; active rows reject edits). Instances move `draft → scheduled →
active → defeated|expired → processing → finalized`, with `cancelled`
exits. Activation snapshots eligible participants (active members at
min level) and resolves the game pool from all phases' constraints;
later batch moves cannot rewrite the roster.

`fn_boss_sweep()` is the production scheduler contract (activate due,
expire overdue + finalize); `fn_advance_boss` is the per-instance
manual trigger. No always-on server is assumed — the manual flow is
fully supported. Finalize locks state, pays participation (and defeat
bonuses on kills, per `apply_on_expire` on expiry), seals immutable
`boss_results`, and is idempotent (`already:true` on replays).
