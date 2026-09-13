/**
 * M18 staging E2E: authenticated student journey.
 * Requires staging test accounts (see docs/production-readiness.md):
 *   E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
 * Skips cleanly when credentials are absent (local runs).
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.E2E_STUDENT_EMAIL ?? "";
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe("student journey", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "needs E2E_STUDENT_EMAIL/PASSWORD (staging only)",
  );

  test("login → dashboard → logout → login again", async ({ page }) => {
    await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole("button", { name: /log\s?in/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await expect(page.locator("body")).toBeVisible();

    // Logout then login again (session rotation).
    await page.getByRole("button", { name: /log\s?out/i }).click();
    await page.waitForURL(/login/, { timeout: 15000 });
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole("button", { name: /log\s?in/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
  });

  test("wrong password is rejected without session", async ({ page }) => {
    await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).first().fill("wrong-password-123");
    await page.getByRole("button", { name: /log\s?in/i }).click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/login");
  });

  test("dashboard, shop, and inventory render for the student", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole("button", { name: /log\s?in/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    for (const path of [
      "/en/dashboard",
      "/en/shop",
      "/en/inventory",
      "/en/recommended",
      "/en/practice",
    ]) {
      const res = await page.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status()).toBeLessThan(500);
    }
  });
});
