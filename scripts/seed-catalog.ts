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
import { GAMES, PROMPT_SETS, WORLDS, validateCatalog } from "@tap/content";
import { upsertGameDefinition } from "./seed-lib";

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
    try {
      const outcome = await upsertGameDefinition(db, game);
      if (outcome !== "updated-same-version") versions += 1;
    } catch (error) {
      fail(`seed ${game.slug}: ${(error as Error).message}`);
    }
    games += 1;
  }

  console.log(
    `seed:catalog OK — worlds=${worlds} prompt_sets=${sets} games=${games} new_versions=${versions}`,
  );
}

void main();
