# New Game Checklist (M18)

Adding a game must require content + configuration only — no
application architecture. Verified against the M4/M6 pipeline:

1. **Prompt/content**: add the prompt set to `@tap/content`
   (`PROMPT_SETS`: ref, kind, items) + `validate-content` passes.
2. **Game definition**: row in `games` (slug, world, category,
   mechanic, mode, difficulty, `prompt_set_ref`, scoring profile,
   unlock rule, attempt rules, theme) + `game_versions` snapshot.
3. **World assignment**: valid `world_id`; map placement data.
4. **Unlock configuration**: `unlock_rule` JSON (open/level/xp/
   accuracy/wpm/games/badges); verify `fn_check_unlock` path.
5. **Scoring configuration**: `scoring_profile_id` (existing or new
   row in `scoring_profiles`).
6. **R2 assets**: `games/{slug}/preview|art` (+ audio packs);
   public vs signed per `visibility.ts`.
7. **Catalog seed**: extend `scripts/seed-catalog.ts` so
   staging/prod receive the same rows.
8. **i18n**: game title/description keys in `en` + `bn` catalogs.
9. **Smoke**: start → submit → validate → progression → unlock
   check, via existing routes (no new endpoints).

Scale note: the catalog is data (100–200+ games fit the same
tables/routes/caches). Per-game cost is one `games` row + prompt
items + assets — no code deploys required after this checklist.
