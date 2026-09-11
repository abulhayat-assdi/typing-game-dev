# Roles & Permissions (M7)

Enforcement order: **PostgreSQL RLS → server guards → route layouts**.
Frontend hiding is never security (proven by pgTAP + 401/403 route tests).

| Capability | student | teacher | admin | super_admin |
|---|---|---|---|---|
| Own data | ✅ | ✅ | ✅ | ✅ |
| Same-batch peers (public fields) | ✅ | ✅ | ✅ | ✅ |
| Assigned-batch attempts/results/streaks | ❌ | ✅ scoped | ✅ org | ✅ |
| Other batches | ❌ | ❌ | ❌ unless org | ✅ |
| Manage courses/batches (own org) | ❌ | ❌ | ✅ | ✅ |
| Roll/batch corrections (own org) | ❌ | ❌ | ✅ audited | ✅ audited |
| Account status (own org) | ❌ | ❌ | ✅ audited | ✅ audited |
| Grant teacher/student | ❌ | ❌ | ✅ | ✅ |
| Grant admin / anyone global | ❌ | ❌ | ❌ | ✅ |
| Ledgers, badges, streaks, results | read own | read scoped | read scoped | read all |
| Feature flags / game catalog | read | read | read | **write** |

Column guard (`trg_profiles_guard`): the one API UPDATE policy on profiles
can only ever flip `account_status` — balances/levels/identity reject with
`PROTECTED_COLUMNS` (owner paths like the progression function bypass by
design). Audit is append-only with org attribution so admins read their own
trail; students and teachers cannot read or write it.
