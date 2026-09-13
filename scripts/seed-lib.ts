/**
 * Shared catalog upsert logic (M19). Extracted verbatim from
 * scripts/seed-catalog.ts so the M20 batch importer
 * (scripts/import-content-batch.ts) writes games through the exact same
 * row shape + version-append semantics. History is never rewritten:
 * changed definitions append game_versions rows and bump current_version.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameDefinition } from "@tap/content";

export function definitionRow(game: GameDefinition): Record<string, unknown> {
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

export type UpsertOutcome = "created" | "updated-new-version" | "updated-same-version";

/** Insert-or-update one game + append a version row only on real change. */
export async function upsertGameDefinition(
  db: SupabaseClient,
  game: GameDefinition,
): Promise<UpsertOutcome> {
  const row = definitionRow(game);
  const existing = await db
    .from("games")
    .select("id, current_version")
    .eq("slug", game.slug)
    .maybeSingle();
  if (existing.error) throw new Error(`games lookup: ${existing.error.message}`);

  let gameId = (existing.data as { id: string } | null)?.id;
  let created = false;
  if (!gameId) {
    const inserted = await db
      .from("games")
      .insert({ ...row, current_version: game.version })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(`games insert ${game.slug}: ${inserted.error?.message}`);
    }
    gameId = (inserted.data as { id: string }).id;
    created = true;
  } else {
    const updated = await db
      .from("games")
      .update({ ...row, current_version: game.version })
      .eq("id", gameId);
    if (updated.error) throw new Error(`games update ${game.slug}: ${updated.error.message}`);
  }

  const latest = await db
    .from("game_versions")
    .select("version, definition")
    .eq("game_id", gameId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(`versions lookup: ${latest.error.message}`);
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
    if (error) throw new Error(`versions insert ${game.slug}: ${error.message}`);
    const bumped = await db
      .from("games")
      .update({ current_version: nextVersion })
      .eq("id", gameId);
    if (bumped.error) throw new Error(`version bump ${game.slug}: ${bumped.error.message}`);
    return created ? "created" : "updated-new-version";
  }
  return created ? "created" : "updated-same-version";
}
