# Local Development (M3)

## Prereqs

Node 20+ (see `.nvmrc`), pnpm 9+, Docker Desktop (for the pgTAP container),
no credentials needed — everything runs on placeholders.

## Web app

```bash
pnpm install
cp .env.example .env.local   # keep placeholders; app fails closed without secrets
pnpm dev                     # or: pnpm --filter @tap/web dev
```

Open `http://localhost:3000` → redirects to `/en` (`/bn` for Bangla).
`/api/health` returns `{ status: "ok", ... }`. Protected paths redirect to
`/en/login` without a session cookie (login UI lands in a later milestone;
server handlers enforce via `getSession()` regardless of middleware).

## Checks

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm check:env && pnpm check:workers && pnpm validate:content
```

## Database (docker, isolated container + port)

See `supabase/README.md` — `tap-postgres-m2` on host port 55432 runs the
migrations + 30-test pgTAP suite. Never point tooling at another project's
containers.

## Production notes

- Build through `opennextjs-cloudflare build/preview/deploy` (wired as
  `build:worker`/`preview`/`deploy` in `apps/web`).
- Secrets only via `wrangler secret put` / dashboard (Supabase service role,
  R2 keys, `AUTH_SECRET`); `preview` vs `production` envs in
  `apps/web/wrangler.jsonc`.
- Worker-bundle builds require WSL2/Linux CI on Windows dev boxes
  (standalone trace copy needs symlink privilege) — see `docs/wrangler.md`.
- R2 public assets are CDN-cached by hashed key; private assets need the
  signed-URL route + a live session.
