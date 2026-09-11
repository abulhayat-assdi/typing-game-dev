/**
 * Browser-safe public environment (M7). No secrets here — only NEXT_PUBLIC_*
 * values. Importable from client components; serverEnv stays in ./server/env.
 */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  r2PublicBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? "",
  defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "en",
} as const;
