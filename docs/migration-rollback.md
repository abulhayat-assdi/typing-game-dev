# Migration & Rollback (M18)

## Applying migrations

Staging/prod Supabase (self-hosted) applies `supabase/migrations/`
in filename order. Verify first on scratch:

```bash
./scripts/verify-migrations.sh        # full chain + pgTAP battery
./scripts/verify-migrations.sh --tests "m16_shop_test m17_ads_test"
```

Then apply to staging, run `scripts/db-integrity.sql`, run the E2E
suite, and only then apply to production during a maintenance window
with a fresh backup taken immediately before.

## Conventions (binding on future milestones)

- Filenames order execution: never rely on out-of-order application
  (the `0014`/`0014b` rename is the cautionary example).
- `CREATE OR REPLACE` + `IF NOT EXISTS` + `DROP ... IF EXISTS`
  everywhere; migrations must be re-runnable.
- Least-privilege grants in the same migration that creates the
  tables (see `0037_api_grants.sql`); future tables get SELECT via
  default privileges, writes only by explicit grant.
- Additive only: no `DROP COLUMN`, no destructive rewrites. History
  tables are append-only by contract.

## Rollback

- **Application**: `wrangler rollback` (Workers keeps prior
  versions) or redeploy the previous git SHA. Stateless; safe.
- **Database**: there is NO automatic destructive rollback — by
  policy. Forward-fix with a new migration. If data recovery is
  needed: restore the pre-deploy backup into a scratch database,
  reconcile with `db-integrity.sql`, and replay by operator decision
  (`scripts/restore-db.sh` refuses prod without `--i-am-sure`).
- App rollback with a newer DB schema is safe as long as schema
  changes stay additive (the convention above guarantees this).
