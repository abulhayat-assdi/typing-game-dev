import { defineConfig, devices } from "@playwright/test";

/**
 * M1: Playwright is wired but no e2e specs yet (M6 adds critical-path e2e).
 * `webServer` boots the Next.js dev server on demand.
 */
export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @tap/web dev --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
