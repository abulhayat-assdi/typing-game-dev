# Workers Deployment (M1)

Adapter: `@opennextjs/cloudflare` (Vinext evaluated per spec; OpenNext is the
validated path — see Phase 0 assessment).

Relevant files (all beside the Next.js app, as the CLI requires):
- `apps/web/wrangler.jsonc` — Worker name, compat date/flags, assets binding,
  `production` + `preview` envs (R2 bucket placeholders only; secrets via
  `wrangler secret put`, never committed).
- `apps/web/open-next.config.ts` — `defineCloudflareConfig({})` (M1 defaults;
  edge-caching overrides land with the snapshot strategy in M5/M6).
- `apps/web` scripts: `build:worker` (`opennextjs-cloudflare build`),
  `preview`, `deploy`, `cf-typegen`.

```bash
pnpm install
pnpm --filter @tap/web dev        # local
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @tap/web preview    # next build + wrangler dev --dry-run
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_DB_URL
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put AUTH_SECRET
pnpm --filter @tap/web deploy     # production
pnpm --filter @tap/web deploy --env preview
```

Constraints: no Vercel-only features; `images.unoptimized` until R2 loader (M3);
`nodejs_compat` flag on; observability enabled; preview vs production envs.

Known M1 environment limitation (Windows dev box, no symlink privilege):
`opennextjs-cloudflare build` forces Next standalone trace collection, which
copies pnpm's symlinked `node_modules` into `.next/standalone` and fails with
`EPERM: operation not permitted, symlink` on Windows without Developer
Mode/admin. The app itself compiles, prerenders and serves correctly
(`pnpm build` + production smoke test both green). Worker-bundle validation
therefore runs on WSL2 or Linux CI starting at M3; do not treat a Windows-only
`opennextjs-cloudflare build` failure as an architecture problem.
