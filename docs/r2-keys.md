# R2 Object-Key Strategy (M1)

Bucket (placeholder): `tap-r2-public` (preview: `tap-r2-public-preview`).
Public base URL from `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` — never hard-code.

```
 /avatars/{userId}/{variant}.{ext}        # original, thumb
 /badges/{badgeSlug}/{variant}.{ext}
 /worlds/{worldSlug}/{asset}.{ext}        # background, map, intro
 /games/{gameSlug}/{asset}.{ext}          # illustration, preview/demo
 /sound/{pack}/{clip}.{ext}
 /ui/{component}/{asset}.{ext}
 /competition/{competitionId}/{asset}.{ext}
 /backups/...                             # NEVER in the public bucket
```

Rules: hashed filenames + long CDN cache for public assets; signed URLs for
private uploads (server-issued); image variants pre-generated at upload
(no sharp on Workers); no secrets/PII exports in R2.
