/**
 * M18 staging E2E: public surfaces (no auth required).
 * Runs against staging via E2E_BASE_URL, or local dev server.
 *
 *   E2E_BASE_URL=https://staging.example pnpm exec playwright test
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("public surfaces", () => {
  test("health probe is green", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  for (const locale of ["en", "bn"]) {
    test(`landing renders (${locale})`, async ({ page }) => {
      const res = await page.goto(`${BASE}/${locale}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
    });

    test(`login renders (${locale})`, async ({ page }) => {
      const res = await page.goto(`${BASE}/${locale}/login`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
    });
  }

  test("unknown locale folds without 500", async ({ page }) => {
    const res = await page.goto(`${BASE}/fr/map`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBeLessThan(500);
  });

  test("no raw translation keys leak on landing", async ({ page }) => {
    await page.goto(`${BASE}/en`, { waitUntil: "domcontentloaded" });
    const html = await page.content();
    // Namespaced key patterns (namespace.key) must never render raw.
    expect(html).not.toMatch(/(dashboard|common|auth|nav)\.[a-zA-Z]+/);
  });
});
