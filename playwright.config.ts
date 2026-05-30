import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Loaded from .env.test.local (or environment when running against prod)
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// Path where auth.setup.ts saves the authenticated session state.
// Added to .gitignore — never committed.
export const STORAGE_STATE = path.join(__dirname, ".auth/session.json");

export default defineConfig({
  testDir: "./tests/e2e",
  // Each test file gets its own isolated browser context.
  fullyParallel: true,
  // Fail the build on CI if a test.only was accidentally left in source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL: BASE_URL,
    // Collect traces on first retry so failures are diagnosable.
    trace: "on-first-retry",
    // Screenshots on failure.
    screenshot: "only-on-failure",
    // Generous timeout — Supabase cold starts can be slow.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  // Global test timeout (per test, not per assertion).
  timeout: 30_000,

  projects: [
    // ── Auth setup ──────────────────────────────────────────────────────────
    // Runs first, once. Produces .auth/session.json used by all other projects.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // ── Desktop (1440×900) ──────────────────────────────────────────────────
    {
      name: "desktop",
      testIgnore: "**/api.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE_STATE,
      },
      dependencies: ["setup"],
    },

    // ── Mobile (390×844 — iPhone 14 Pro) ────────────────────────────────────
    {
      name: "mobile",
      testIgnore: "**/api.spec.ts",
      use: {
        ...devices["iPhone 14 Pro"],
        storageState: STORAGE_STATE,
      },
      dependencies: ["setup"],
    },

    // ── API (browser-free HTTP tests) ────────────────────────────────────────
    // No storageState or browser setup — uses Playwright's request fixture only.
    // Runs independently of the auth setup step.
    {
      name: "api",
      testMatch: "**/api.spec.ts",
    },
  ],

  // Auto-start the dev server when running locally.
  // Skipped on CI when BASE_URL is set to a remote URL.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
