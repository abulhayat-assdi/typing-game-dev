# Load Testing (M18)

## Method

- HTTP: `scripts/load-test.mjs` (dependency-free Node; p50/p95/p99,
  error rate, exit-nonzero SLO breach). Never one-write-per-keystroke
  (typing stays local); measures page/API latency under concurrency.
- DB races: `scripts/concurrency-test.sh` (two simultaneous callers,
  invariant assertions, 3 rounds each).
- Rerun targets: 25 / 50 / 100 concurrent students; focus login,
  dashboard, game start/submit, progression, missions, leaderboards,
  competition/clan/boss reads, shop purchase, reward sessions.

## Measured results (this milestone)

Local dev server (port 3210), 25c/200req mixed health+page:
0 errors. Warmed single page ~0.6s (dev compile overhead included).

Local workerd preview (production build), same app:
- 25 concurrent, mixed `/api/health` + login page: 200/200,
  p50 314ms, p95 945ms, p99 1.0s, 0 errors.
- 100 concurrent, `/api/health`: 500/500, p50 1.3s, p95 1.6s,
  p99 2.4s, 0 errors.

DB races (fresh chain, `concurrency-test.sh`): **14/14**
(single purchase/debit, single grant, single progression, single
advancement, single point event; zero negatives).

## Interpretation

Local numbers are a floor, not a forecast: dev has compile overhead;
local workerd is single-threaded. Real edge + pooled Supabase will
differ — rerun this exact harness against staging before launch
marketing and record numbers here.

## Performance findings

- EXPLAIN audit (5k-row volume): one real gap found and fixed —
  `competition_entries(user_id)` Seq-scanned dashboard reads; added
  `entries_user_idx` (`0038`), verified Index Scan. All other hot
  paths already index-served (PK/UNIQUE leading columns, dedicated
  indexes, partial active-user index).
- No N+1 found in stores (single-query projections + joins);
  adaptive recompute and sweeps run off-request by contract.
- Watchlist: `season_point_events` growth (board index covers
  ranking; consider partitioning past 10M rows), `audit_logs`
  retention policy, R2 object sizes on new game art.
