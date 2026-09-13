/**
 * Content batch importer (M19, Track B.16). Validates a JSON batch of
 * BatchGameSpecs through the same validators the tests enforce, prints a
 * report, and — only with --apply against a NON-prod database — expands
 * specs to GameDefinitions (template defaults) and upserts them through
 * the shared seed-lib path (identical row shape + version-append
 * semantics as seed-catalog.ts).
 *
 * Usage:
 *   tsx scripts/import-content-batch.ts --batch batches/m20-batch-01.json
 *   tsx scripts/import-content-batch.ts --batch <file> --require-bn \
 *     --assets <r2-listing.json> --reward-registry <rewards.json>
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     tsx scripts/import-content-batch.ts --batch <file> --apply
 *   # prod-shaped names require: --apply --i-am-sure
 *
 * Batch file shape: { "games": BatchGameSpec[], "rewardRegistry"?: string[],
 *   "assetKeys"?: string[] } (a bare BatchGameSpec[] array also works).
 * Asset/reward lists may live inline or in the --assets/--reward-registry
 * sidecar files (arrays of strings).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  catalogBatchContext,
  getMechanicTemplate,
  toGameDefinition,
  validateGameBatch,
  type BatchGameSpec,
} from "@tap/content";
import { upsertGameDefinition } from "./seed-lib";

function fail(message: string): never {
  console.error(`import-content-batch FAILED: ${message}`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    fail(`cannot read ${path}: ${(error as Error).message}`);
  }
}

function readStringArray(path: string): string[] {
  const data: unknown = readJson(path);
  if (!Array.isArray(data) || !data.every((s): s is string => typeof s === "string")) {
    fail(`${path} must be a JSON array of strings`);
  }
  return data;
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
  const batchPath = arg("--batch");
  if (!batchPath) fail("pass --batch <file.json>");
  const batchFile: string = batchPath;

  const raw: unknown = readJson(batchFile);
  const specs: BatchGameSpec[] = Array.isArray(raw)
    ? (raw as BatchGameSpec[])
    : (raw as { games: BatchGameSpec[] }).games;
  if (!Array.isArray(specs) || specs.length === 0) {
    fail(`${batchFile} must contain a non-empty "games" array`);
  }

  const inline = (Array.isArray(raw) ? {} : (raw as Record<string, unknown>)) as {
    rewardRegistry?: string[];
    assetKeys?: string[];
  };
  const assetsPath = arg("--assets");
  const rewardsPath = arg("--reward-registry");
  const rewardRegistry = rewardsPath ? readStringArray(rewardsPath) : inline.rewardRegistry;
  const assetKeys = assetsPath ? readStringArray(assetsPath) : inline.assetKeys;

  const ctx = catalogBatchContext({
    ...(rewardRegistry ? { rewardRegistry } : {}),
    ...(assetKeys ? { assetKeys } : {}),
    ...(hasFlag("--require-bn") ? { requireBn: true } : {}),
  });
  const report = validateGameBatch(specs, ctx);
  for (const warning of report.warnings) console.log(`  warn: ${warning}`);
  if (report.errors.length > 0) {
    for (const error of report.errors) console.error(`  error: ${error}`);
    fail(`${report.errors.length} validation error(s) in ${batchFile}`);
  }
  console.log(
    `import-content-batch VALID — ${specs.length} spec(s), ${report.warnings.length} warning(s)`,
  );

  if (!hasFlag("--apply")) {
    console.log("dry run (no --apply): database untouched");
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isReal(url) || !isReal(serviceKey)) {
    fail("set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to real values first");
  }
  const dbName = (url as string).split("/").pop() ?? "";
  if (dbName.includes("prod") && !hasFlag("--i-am-sure")) {
    fail(`refusing to apply to "${dbName}" without --i-am-sure`);
  }
  const db = createClient(url as string, serviceKey as string, {
    auth: { persistSession: false },
  });

  let created = 0;
  let versioned = 0;
  for (const spec of specs) {
    const def = toGameDefinition(spec, getMechanicTemplate(spec.mechanic));
    try {
      const outcome = await upsertGameDefinition(db, def);
      if (outcome === "created") created += 1;
      if (outcome === "updated-new-version") versioned += 1;
      console.log(`  ${outcome}: ${spec.slug}`);
    } catch (error) {
      fail(`apply ${spec.slug}: ${(error as Error).message}`);
    }
  }
  console.log(
    `import-content-batch APPLIED — created=${created} new_versions=${versioned} total=${specs.length}`,
  );
}

void main();
