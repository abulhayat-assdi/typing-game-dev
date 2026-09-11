/**
 * Catalog seed loader (M4). Upserts worlds, prompt sets, games and immutable
 * game versions from @tap/content (the source of truth) into Supabase.
 *
 * Usage: pnpm seed:catalog
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * with REAL values — placeholders fail closed. Never runs client-side.
 * Safe to re-run: new definition versions append game_versions rows and bump
 * current_version; history is never rewritten.
 */
import { createClient } from "@supabase/supabase-js";
import {
  GAMES,
  PROMPT_SETS,
  WORLDS,
  validateCatalog,
  type GameDefinition,
} from "@tap/content";

function fail(message: string): never {
  console.error(`seed:catalog FAILED: ${message}`);
  process.exit(1);
}

function isReal(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("placeholder-") &&
    !value.includes("example.com")
  );
}

function definitionRow(game: GameDefinition): Record<string, unknown> {
  return {
    slug: game.slug,
    world_id: game.worldSlug,
    category: game.category,
    mechanic: game.mechanic,
    mode: game.mode,
    difficulty: game.difficulty,
    skill_bands: game.skillBands,
    prompt_set_ref: game.promptSource.ref,
    prompt_units: game.promptSource.units,
    input: game.inputRules,
    timing: game.timingRules,
    scoring_profile_id: game.scoringProfile,
    unlock_rule: game.unlockRule,
    attempt_rules: game.attemptRules,
    theme: game.theme,
    config: game.config,
    competition_eligible: game.competitionEligible,
    is_active: game.isActive,
  };
}

async function main(): Promise<void> {
  const errors = validateCatalog();
  if (errors.length > 0) {
    fail(`catalog invalid:\n- ${errors.join("\n- ")}`);
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isReal(url) || !isReal(serviceKey)) {
    fail("set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to real values first");
  }
  const db = createClient(url as string, serviceKey as string, {
    auth: { persistSession: false },
  });

  let worlds = 0;
  for (const w of WORLDS) {
    const { error } = await db.from("worlds").upsert(
      {
        id: w.slug,
        sort_order: w.order,
        name_en: w.name.en,
        name_bn: w.name.bn,
        description_en: w.description.en,
        description_bn: w.description.bn,
      },
      { onConflict: "id" },
    );
    if (error) fail(`worlds upsert: ${error.message}`);
    worlds += 1;
  }

  let sets = 0;
  for (const set of Object.values(PROMPT_SETS)) {
    const { error } = await db.from("prompt_sets").upsert(
      {
        ref: set.ref,
        version: set.version,
        kind: set.kind,
        language: set.language,
        items: set.items,
      },
      { onConflict: "ref" },
    );
    if (error) fail(`prompt_sets upsert: ${error.message}`);
    sets += 1;
  }

  let games = 0;
  let versions = 0;
  for (const game of GAMES) {
    const row = definitionRow(game);
    const existing = await db
      .from("games")
      .select("id, current_version")
      .eq("slug", game.slug)
      .maybeSingle();
    if (existing.error) fail(`games lookup: ${existing.error.message}`);

    let gameId = (existing.data as { id: string } | null)?.id;
    if (!gameId) {
      const inserted = await db
        .from("games")
        .insert({ ...row, current_version: game.version })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) {
        fail(`games insert ${game.slug}: ${inserted.error?.message}`);
      }
      gameId = (inserted.data as { id: string }).id;
    } else {
      const updated = await db
        .from("games")
        .update({ ...row, current_version: game.version })
        .eq("id", gameId);
      if (updated.error) fail(`games update ${game.slug}: ${updated.error.message}`);
    }

    const latest = await db
      .from("game_versions")
      .select("version, definition")
      .eq("game_id", gameId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) fail(`versions lookup: ${latest.error.message}`);
    const latestDef = (latest.data as { version: number; definition: unknown } | null)
      ?.definition;
    if (JSON.stringify(latestDef ?? null) !== JSON.stringify(game)) {
      const nextVersion =
        ((latest.data as { version: number } | null)?.version ?? 0) + 1;
      const { error } = await db.from("game_versions").insert({
        game_id: gameId,
        version: nextVersion,
        definition: game,
      });
      if (error) fail(`versions insert ${game.slug}: ${error.message}`);
      versions += 1;
      const bumped = await db
        .from("games")
        .update({ current_version: nextVersion })
        .eq("id", gameId);
      if (bumped.error) fail(`version bump ${game.slug}: ${bumped.error.message}`);
    }
    games += 1;
  }

  console.log(
    `seed:catalog OK — worlds=${worlds} prompt_sets=${sets} games=${games} new_versions=${versions}`,
  );
}

void main();
