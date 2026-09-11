# RLS Matrix (M1 — enforced in M2 migrations)

| Subject | Private own data | Same-batch public | Other batch | Ledgers/unlocks/results |
|---|---|---|---|---|
| student | SELECT own row | SELECT privacy-safe view | DENY (0 rows) unless whitelisted event | NO direct write; via `fn_submit_attempt` etc. |
| teacher | assigned batches | assigned batches | DENY | NO (functions + audit only) |
| admin | org scope | org scope | org policy | via functions + `audit_logs` |
| super_admin | global (via functions) | global | global | via functions + `audit_logs` |

Helpers: `is_super_admin()`, `is_org_admin(org)`, `is_teacher_of(batch)`,
`is_batch_member(batch)`, `is_clan_member(clan)`, `is_clan_leader(clan)`.
`audit_logs` append-only. Service-role key server-only.
