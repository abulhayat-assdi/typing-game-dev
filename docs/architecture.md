# Architecture (M1 foundation)

One monorepo, one auth/XP/leaderboard/clan system, all phases behind flags.

```
Browser (en/bn, responsive, a11y)
  → Cloudflare CDN/WAF
  → Workers + Next.js App Router (@opennextjs/cloudflare)
  → Self-hosted Supabase on VPS (Postgres + Auth + RLS + minimal Realtime)
  → Cloudflare R2 (sole media store)
```

- Trust boundary: Route Handlers / Server Actions recompute scores and call
  `SECURITY DEFINER` Postgres functions. Clients never write ledgers directly.
- Config-driven: XP curve, rewards, unlocks, badges, competitions, ad/clan/
  season limits live in DB tables, not code. Env holds secrets + targets only.
- Engine: ~14 mechanics render ~245 games via `GameDefinition` JSON (M4).
- Flags: `PHASE_1_CORE=true`, rest OFF until their milestones (see
  `supabase/migrations/0001_feature_flags.sql`).

Milestones: M1 foundation → M2 DB+RLS → M3 shell/i18n/R2 → M4 engine/content →
M5 economy pipeline → M6 student/staff UI → M7 adaptive/clan → M8 ads →
M9 wars/seasons → M10 hardening + prod cutover.
