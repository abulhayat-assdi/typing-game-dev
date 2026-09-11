# Supabase — migrations, seeds, tests (M2)

Production: self-hosted Supabase on your VPS. Migrations apply in filename
order via the Supabase CLI / dashboard SQL editor:

```bash
supabase db push        # from the repo root (once the CLI is linked to the VPS)
```

M1: `migrations/0001_feature_flags.sql` (launch flags, P1 ON / rest OFF).

M2 (DB core + Auth + RLS — no UI, no game logic):
- `migrations/0002_identity_org.sql` — enums, organizations → courses →
  batches, profiles (1:1 `auth.users`), user_roles (scoped), teacher
  assignments, batch_members (roll unique per batch, one active batch per
  user), append-only audit_logs.
- `migrations/0003_helpers.sql` — SECURITY DEFINER RLS predicates
  (`is_super_admin`, `is_org_admin`, `is_batch_member`,
  `is_teacher_of_batch`, `batch_organization_id`), EXECUTE to
  `authenticated` only.
- `migrations/0004_rls_core.sql` — RLS matrix. Plain ENABLE (never FORCE) so
  owners/service_role keep bypassing for triggers and functions.
- `migrations/0005_fn_register_with_batch.sql` — atomic registration
  (join-code → roll check → single-active-batch → profile + student role +
  membership) plus the roll-correction audit trigger.
- `seed/dev.sql` — DEV ONLY (Demo Academy example from spec §4).

## Local verification (docker, no Supabase CLI needed)

The pgTAP container emulates the Supabase Auth Postgres surface
(`tests/bootstrap_auth_stub.sql` — test-only, never shipped) so RLS is tested
exactly as PostgREST would enforce it.

```bash
# 1. start an isolated Postgres (own container + port; never touch other projects)
docker run -d --name tap-postgres-m2 -e POSTGRES_PASSWORD=taptest \
  -p 55432:5432 postgres:17-bookworm
docker exec tap-postgres-m2 apt-get update
docker exec tap-postgres-m2 apt-get install -y postgresql-17-pgtap
docker exec tap-postgres-m2 psql -U postgres -c "CREATE DATABASE tap_test;"

# 2. copy SQL in and apply in order
docker cp supabase tap-postgres-m2:/supabase
docker exec tap-postgres-m2 psql -U postgres -d tap_test \
  -f /supabase/tests/bootstrap_auth_stub.sql \
  -f /supabase/migrations/0001_feature_flags.sql \
  -f /supabase/migrations/0002_identity_org.sql \
  -f /supabase/migrations/0003_helpers.sql \
  -f /supabase/migrations/0004_rls_core.sql \
  -f /supabase/migrations/0005_fn_register_with_batch.sql \
  -f /supabase/seed/dev.sql

# 3. run the suite (30 tests; wrapped in BEGIN/ROLLBACK, rerunnable)
docker exec tap-postgres-m2 psql -U postgres -d tap_test \
  -f /supabase/tests/m2_core_test.sql
```

`tests/README.md` lists the 20 critical scenarios; M2 covers registration,
login-read, batch isolation, RLS enforcement, roll audit and unauthorized
access. The container is kept running for M4/M5 reuse.

## M4 — content catalog + attempt pipeline

```bash
# copy the new files in, then apply in order (0006/0007 idempotent)
docker cp supabase tap-postgres-m2:/supabase
docker exec tap-postgres-m2 psql -U postgres -d tap_test -v ON_ERROR_STOP=1 \
  -f /supabase/migrations/0006_content_catalog.sql \
  -f /supabase/migrations/0007_attempt_pipeline.sql

# 27-test suite (start/submit/get, ownership, expiry, double-finalize,
# immutability, catalog reads; BEGIN/ROLLBACK, rerunnable)
docker exec tap-postgres-m2 psql -U postgres -d tap_test -v ON_ERROR_STOP=1 \
  -f /supabase/tests/m4_attempt_test.sql
```

`seed/dev.sql` stays DEV-only. The full 26-game catalog loads via
`pnpm seed:catalog` against staging/prod (service role, never committed
credentials) — see `scripts/seed-catalog.ts`.
