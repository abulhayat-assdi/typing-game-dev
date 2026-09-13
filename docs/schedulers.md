# Schedulers (M18)

Production jobs must never depend on manual admin clicks. Each sweep
is idempotent and safe to re-run; schedule all of them.

## Recommended runner: VPS cron (service-role psql)

Cloudflare Scheduled Workers are possible, but VPS cron keeps job
credentials inside the existing Supabase trust boundary and reuses
the backup/monitoring host. Either runner must call the same fns.

```cron
# /etc/cron.d/tap-sweeps (times UTC)
*/15 * * * * postgres psql "$SUPABASE_DB_URL" -qc "SELECT public.fn_rewarded_sweep(); SELECT public.fn_shop_sweep();" >>/var/log/tap-sweeps.log 2>&1
*/15 * * * * postgres psql "$SUPABASE_DB_URL" -qc "SELECT public.fn_tournament_sweep();" >>/var/log/tap-sweeps.log 2>&1
0  * * * *  postgres psql "$SUPABASE_DB_URL" -qc "SELECT public.fn_season_sweep(); SELECT public.fn_adaptive_sweep();" >>/var/log/tap-sweeps.log 2>&1
```

| Job | Fn | Cadence | Contract |
|---|---|---|---|
| War lifecycle | war sweep fn | 15 min | closes/starts/finalizes due wars |
| Boss expiry | boss sweep fn | 15 min | expires/finalizes instances |
| Season transitions | `fn_season_sweep()` | hourly | activates due, settles overdue |
| Mission daily/weekly | lazy assign on read + weekly cron | daily | `fn_assign_daily/weekly` idempotent |
| Tournament transitions | `fn_tournament_sweep()` | 15 min | closes registration, starts due |
| Shop expiry | `fn_shop_sweep()` | 15 min | zeroes lapsed inventory |
| Adaptive refresh | `fn_adaptive_sweep()` | hourly | recomputes stale profiles (50/run) |
| Rewarded expiry | `fn_rewarded_sweep()` | 15 min | parks stale sessions expired |

## Alternative: Cloudflare Scheduled Worker

A `scheduled` handler calling the same RPCs via the service-role
key is acceptable if VPS cron is unavailable — but then the service
key lives in Workers secrets (audited, rotated) and each run must
log outcomes to Workers Logs. Do not run both runners concurrently
(all fns are idempotent, so overlap is safe but wasteful).

## Monitoring

Alert on: sweep errors in Postgres logs, `failed` session spikes
(`fn_rewarded_funnel`), unprocessed `processing` tournaments/wars
older than 1h (stuck-state query in runbook).
