import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext Cloudflare adapter config. Must live beside the Next.js app
// (apps/web). Defaults are correct for App Router on Workers in M1;
// edge-caching overrides land with the snapshot strategy (M5/M6).
export default defineCloudflareConfig({});
