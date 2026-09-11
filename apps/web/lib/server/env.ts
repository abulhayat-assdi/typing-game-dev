/**
 * Server-only environment accessor (M1 foundation, M3 R2/auth additions).
 * Never import SUPABASE_SERVICE_ROLE_KEY (or any server secret) into client
 * components. Client code must only read NEXT_PUBLIC_* values.
 *
 * `isXConfigured()` guards fail CLOSED: placeholder/example values count as
 * unconfigured, so dev-without-secrets can never mint sessions or URLs.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith("placeholder-")) {
    // Placeholders are allowed in scaffolding; fail loudly only in production.
    if (process.env.APP_ENV === "production") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value ?? "";
  }
  return value;
}

function isReal(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("placeholder-") &&
    !value.includes("example.com") &&
    !value.includes("example-r2.dev")
  );
}

export const serverEnv = {
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseDbUrl: () => required("SUPABASE_DB_URL"),
  r2AccountId: () => required("R2_ACCOUNT_ID"),
  r2AccessKeyId: () => required("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: () => required("R2_SECRET_ACCESS_KEY"),
  r2Bucket: () => required("R2_PUBLIC_BUCKET"),
  r2PrivateBucket: () => required("R2_PRIVATE_BUCKET"),
  authSecret: () => required("AUTH_SECRET"),
  /** Default presigned-URL TTL seconds (clamped 60..3600 by callers). */
  r2SignedUrlTtlSeconds: () => {
    const raw = Number(process.env.R2_SIGNED_URL_TTL_SECONDS ?? "600");
    if (!Number.isFinite(raw)) return 600;
    return Math.min(3600, Math.max(60, Math.floor(raw)));
  },
} as const;

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  r2PublicBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "",
  defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "en",
} as const;

/** Fail-closed configuration probes (safe to call anywhere server-side). */
export function isSupabaseConfigured(): boolean {
  return isReal(publicEnv.supabaseUrl) && isReal(publicEnv.supabaseAnonKey);
}

export function isR2Configured(): boolean {
  return (
    isReal(process.env.R2_ACCOUNT_ID) &&
    isReal(process.env.R2_ACCESS_KEY_ID) &&
    isReal(process.env.R2_SECRET_ACCESS_KEY) &&
    isReal(process.env.R2_PUBLIC_BUCKET)
  );
}
