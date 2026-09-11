# Competition admin guide (M8)

Teachers (`/[locale]/teacher/competitions`): list visible competitions,
8-step creation (basic → eligibility → game → schedule → attempts →
scoring → rewards → review), draft editing, publish/open/close, board and
final results. Creation is limited to assigned batches; cross-batch and
cross-teacher management fail in `fn_can_manage_competition` (403, and RLS
hides the rows).

Admins (`/[locale]/admin/competitions`): organization-wide oversight —
cross-batch competitions within their orgs, finalize/cancel where
authorized. Super admins: global. Layouts gate by role (`requireTeacher`
/ `requireAdmin`); controls a role may not use are never rendered, and
forged ids 404 opaquely.

API (staff role + DB re-check per competition):
`POST /api/competitions` (201, 400 validation, 403 students),
`PATCH /api/competitions/[id]` (drafts only, 409 `NOT_DRAFT`),
`POST .../[id]/publish|open|close`, `POST .../[id]/finalize`
(returns `{participants, batches, rewards}`; re-run 409).

Rewards reuse M5: finalize writes `xp_ledger`/`coin_ledger` rows and
`competition_reward_events` under idempotency keys, plus optional
first-place badges — no `competition_xp` or side balances. Audit:
`competition_state_events` records every lifecycle hop; adjustments are
append-only with old/new values. Students can never create, modify,
finalize, inject scores, or self-register into foreign batches; duplicate
registration and duplicate rewards are impossible by constraint + key.
