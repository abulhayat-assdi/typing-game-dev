# Production Readiness (M18)

## Environments

| | Development | Staging | Production |
|---|---|---|---|
| App | `pnpm dev` | Workers `preview` env | Workers `production` env |
| Database | local docker / `verify-migrations.sh` scratch | self-hosted Supabase staging project | self-hosted Supabase prod project |
| Seed | `supabase/seed/dev.sql` | `supabase/seed/staging.sql` | `supabase/seed/prod.sql` (guard only, zero demo data) |
| R2 | dev prefix/bucket | `tap-r2-public-preview` | `tap-r2-public` |
| Secrets | `.env.local` (never committed) | wrangler preview secrets | `wrangler secret put` / dashboard |

Rules: never point dev tests at prod; never commit secrets; staging
mirrors prod shape with sanitized data.

## Checklist

### VPS / Supabase
- [ ] Ubuntu LTS + unattended upgrades; firewall (UFW) allowing
  22 (operator IP), 80/443 only — **never expose 5432 publicly**
- [ ] Supabase via docker compose with `restart: unless-stopped`;
  verified `docker compose up -d` after reboot
- [ ] Connection pooling (Supavisor/pgbouncer) sized: pool ≥
  (Workers concurrency × per-request connections) + headroom
- [ ] Disk/CPU/RAM monitoring + alerts; Postgres log rotation
- [ ] `SELECT * FROM pg_stat_activity` baseline recorded; slow-query
  log (`log_min_duration_statement = 500`) reviewed weekly
- [ ] Auth: site URL + redirect allow-list set to prod/staging
  domains; SMTP configured; confirmation + recovery emails tested

### PostgreSQL
- [x] Fresh-chain migration verified: `scripts/verify-migrations.sh`
  (0001→0038, natural order, zero manual edits)
- [x] Grants migration `0037_api_grants` applied (BLOCKER fix: no
  table grants existed before M18 — production reads/writes all
  failed without it)
- [x] Integrity gate: `scripts/db-integrity.sql` green after restore
- [ ] `scripts/db-integrity.sql` scheduled post-restore + weekly

### Auth E2E (staging)
- [ ] Student register → confirm → login → dashboard → play →
  result/XP/streak/mission → profile → leaderboard → logout → login
- [ ] Negative paths: wrong password, invalid email, reset flow,
  suspended/inactive, expired session, role changes
- [ ] Teacher batch view; admin CRUD; super-admin globals
- [ ] Suite: `apps/web/e2e/` (`E2E_BASE_URL`, staging creds);
  public specs run green locally (7 passed)

### R2
- [ ] Prod + staging buckets exist; `cosmetics/` public prefixes live
  under `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`; private assets via
  signed-URL route (`SIGNABLE_PREFIXES`)
- [ ] No credentials in source (scan: `scripts/scan-secrets.sh`)
- [ ] Lifecycle rules for tmp/uploads; asset inventory matches
  `validate-content` (no dead references)

### Workers
- [x] `build:worker` (OpenNext) produces `.open-next/worker.js`
- [x] `preview` runtime verified: health/pages 200, no errors
- [x] Load baseline (local workerd): 25c mixed p50 314ms p95 945ms;
  100c health p50 1.3s p95 1.6s; 0 errors (local numbers — edge
  differs; rerun against staging)
- [ ] Custom domain + SSL + `wrangler deploy`; env/secrets per env
- [ ] `observability.enabled` on (already in `wrangler.jsonc`)

### DNS / SSL / Security
- [ ] Cloudflare DNS + Full (strict) TLS; WAF + bot rules on
  auth/API routes; rate-limit login/submit/purchase
- [ ] Security headers + cache-control verified; CORS locked to app
  origin; VPS origin hidden (no direct Supabase/R2 URLs public
  beyond the anon-key API surface, RLS-enforced, HTTPS-only)
- [x] Secret scan clean (source + `.open-next` artifacts +
  service-role surface)

### Backups (RPO ≤ 24h, RTO ≤ 2h)
- [x] `scripts/backup-db.sh`: pg_dump custom + gzip + AES-256-CBC,
  sha256 manifest, decrypt/TOC verification, retention (14d)
- [x] Restore tested into disposable DB (128 tables, INTEGRITY_OK):
  `scripts/restore-db.sh` refuses prod without `--i-am-sure`
- [ ] Nightly cron + **off-VPS** copy (`OFFSITE_CMD`, e.g. rclone);
  monthly restore drill logged

### Monitoring / Schedulers
- [ ] Cloudflare observability + alerts (5xx, latency, Worker errors)
- [ ] Sweeps on VPS cron (service-role `psql`, never admin clicks):
  war/boss/season/adaptive/shop/rewarded expiry — see
  `docs/schedulers.md`
- [ ] Request IDs: Cloudflare `cf-ray` + Supabase `request-id`
  preserved in error reports

### Product gates
- [x] Rewarded ads OFF by default (`REWARDED_ADS_ENABLED=false`,
  `GOOGLE_REWARDED_ENABLED=false`); normal play verified ad-free
- [x] No raw i18n keys on landing (E2E); bn gaps documented
  (fallback to English by design)
- [x] Shop/coins: no mint/transfer/cash-out paths exist
- [x] a11y static pass (img alts, labeled mock dialog); full
  screen-reader + device pass is operator-side (checklist below)

### Mobile / a11y operator pass
- [ ] Android Chromium + iOS Safari: register → play → results →
  missions → clan → shop (physical keyboard preferred for typing)
- [ ] Keyboard-only run, focus order, contrast spot-check, reduced
  motion, result announcements, touch targets ≥ 44px

## Known issues (do not hide)

- **RESOLVED (was HIGH)**: missing table grants — every production
  read/write failed. Fixed by `0037_api_grants.sql` (least
  privilege) + verified in staging-chain tests.
- **RESOLVED (was MEDIUM)**: shop double-charge race
  (check-then-act across the balance lock). Fixed by
  lock → re-check → reserve → debit ordering in `fn_purchase_item`;
  proven by `scripts/concurrency-test.sh` (14/14).
- **RESOLVED (was MEDIUM)**: rewarded-ads failure bookkeeping lost
  to RAISE rollback (failure analytics + stuck sessions). Fixed by
  persist-then-report codes; proven in `m17_ads_test` (41/41).
- **RESOLVED (was LOW)**: M7 audit test seed-fragile exact count.
  Isolated fix: assert the audit-course row specifically (32/32).
- **HIGH**: Next.js 15 sync `params` access across ~60 pages (dev
  warnings; works at runtime today, migration debt for M19).
- **MEDIUM**: partial Bangla coverage (bosses/clans/competitions/
  missions/seasons/wars namespaces fall back to English by design).
- **MEDIUM**: Google Offerwall exposes no verifiable custom-reward
  callback — custom grants stay fail-closed (documented limitation,
  not a bug).
- **LOW**: load numbers are local (dev/workerd); staging rerun
  required before launch marketing.
