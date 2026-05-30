import { test as setup, expect } from "@playwright/test";
import path from "path";

const STORAGE_STATE = path.join(__dirname, "../../.auth/session.json");

/**
 * Logs in once and saves the authenticated browser storage state to
 * .auth/session.json. All other test projects load this as their
 * storageState so they skip the login flow entirely.
 *
 * Requires env vars:
 *   TEST_USER_EMAIL
 *   TEST_USER_PASSWORD
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL and TEST_USER_PASSWORD must be set. " +
        "Copy .env.test.local.example to .env.test.local and fill in the values.",
    );
  }

  await page.goto("/login");

  // Wait for the login form to be ready.
  await page.waitForSelector('input[type="email"]');

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // After a successful login AppShell replaces /login with /.
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  // Persist the Supabase session tokens held in localStorage so every
  // subsequent test project can skip the login round-trip.
  await page.context().storageState({ path: STORAGE_STATE });
});
