# Backup & Recovery (M1 — procedures executable before launch, M10 drill)

- Nightly `pg_dump` + WAL archiving to OFF-VPS storage (never VPS-only).
- 30-day retention; quarterly restore drill on a staging host.
- Monitor: CPU/RAM/disk, PG connections, query latency, error rate.
- Pinned Docker/Supabase versions; deliberate upgrades; restart policies on.
- R2 holds a second copy of backup manifests (not the only copy).
- Disaster runbook owner + RTO/RPO declared before business-critical launch.

Status: documented in M1; automated + drill-verified in M10.
