// Validates that every required env var is *documented* in .env.example.
// M1 does not require real secrets — placeholders are expected.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const examplePath = resolve(root, ".env.example");

if (!existsSync(examplePath)) {
  console.error("MISSING .env.example");
  process.exit(1);
}

const text = readFileSync(examplePath, "utf8");
const required = [
  "APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_DEFAULT_LOCALE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
  "R2_PRIVATE_BUCKET",
  "R2_SIGNED_URL_TTL_SECONDS",
  "AUTH_SECRET",
  "FEATURE_PHASE_1_CORE",
  "FEATURE_PHASE_2_ADAPTIVE",
  "FEATURE_PHASE_2_REWARDED_ADS",
  "FEATURE_PHASE_3_CLAN_WARS",
  "FEATURE_PHASE_3_SEASONS",
  "ADS_PROVIDER",
  "ADS_OFFERWALL_ENABLED",
];

const missing = required.filter((k) => !text.includes(k));
if (missing.length > 0) {
  console.error(`.env.example missing keys: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`check-env OK — ${required.length} keys documented.`);
