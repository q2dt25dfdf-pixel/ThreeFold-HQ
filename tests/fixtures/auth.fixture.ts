import { test as base, expect, type Page } from "@playwright/test";

type ConsoleError = { type: string; text: string; url: string };
type PageError = { message: string; url: string };

export type HQFixtures = {
  /** Authenticated page with automatic console-error and pageerror collection. */
  hqPage: Page;
  /** Errors collected during the test. Asserted clean after each test. */
  consoleErrors: ConsoleError[];
  pageErrors: PageError[];
};

/**
 * Extended test fixture used by all HQ spec files.
 *
 * Automatically:
 *   - Provides an authenticated page (storageState loaded via playwright.config.ts)
 *   - Captures all console errors and uncaught JS exceptions
 *   - Fails the test if any were emitted during the test body
 *
 * Usage:
 *   import { test, expect } from "../fixtures/auth.fixture";
 *   test("my test", async ({ hqPage }) => { ... });
 */
export const test = base.extend<HQFixtures>({
  consoleErrors: async ({}, use) => {
    await use([]);
  },

  pageErrors: async ({}, use) => {
    await use([]);
  },

  hqPage: async ({ page, consoleErrors, pageErrors }, use) => {
    // Capture browser-side console errors (not warnings or logs).
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({
          type: msg.type(),
          text: msg.text(),
          url: page.url(),
        });
      }
    });

    // Capture uncaught JS exceptions and unhandled promise rejections.
    page.on("pageerror", (err) => {
      pageErrors.push({
        message: err.message,
        url: page.url(),
      });
    });

    await use(page);

    // After the test body, assert no errors were collected.
    // This runs even if the test itself passed, so a silent console error
    // still causes a failure.
    expect(
      pageErrors,
      `Uncaught JS errors on page:\n${pageErrors.map((e) => `  [${e.url}] ${e.message}`).join("\n")}`,
    ).toHaveLength(0);

    expect(
      consoleErrors,
      `Console errors on page:\n${consoleErrors.map((e) => `  [${e.url}] ${e.text}`).join("\n")}`,
    ).toHaveLength(0);
  },
});

export { expect };
