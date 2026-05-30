/**
 * Security Fix Sprint 4 — /api/internal/* auth gate smoke tests.
 *
 * Uses Playwright's request fixture (pure HTTP, no browser).
 * Runs under the "api" project which has no browser setup.
 *
 * Unauthenticated tests (12): verify all four routes return 401 for missing,
 * malformed, or non-Bearer Authorization headers. These always run.
 *
 * Authenticated success tests are intentionally limited:
 *
 *   /api/internal/notify            SKIPPED — authenticated POST inserts a
 *   /api/internal/test-notification  notification record and/or fires a push.
 *                                   Both are mutating; no safe non-mutating call
 *                                   exists for these routes.
 *
 *   /api/internal/signed-urls       OPTIONAL — paths:[] returns {} without
 *   /api/internal/design-signed-urls hitting storage (non-mutating). Tests run
 *                                   when SUPABASE_TEST_ACCESS_TOKEN is set in
 *                                   .env.test.local, skip otherwise.
 *
 * No data is created, modified, or deleted by any test in this file.
 */

import { test, expect } from "@playwright/test";

const NOTIFY = "/api/internal/notify";
const SIGNED_URLS = "/api/internal/signed-urls";
const DESIGN_SIGNED_URLS = "/api/internal/design-signed-urls";
const TEST_NOTIFICATION = "/api/internal/test-notification";

// ---------------------------------------------------------------------------
// Unauthenticated 401 cases — no secrets, no side effects, always run
// ---------------------------------------------------------------------------

const ROUTES = [
  { label: "notify", url: NOTIFY, body: { type: "test", title: "test", message: "" } },
  { label: "signed-urls", url: SIGNED_URLS, body: { paths: [] } },
  { label: "design-signed-urls", url: DESIGN_SIGNED_URLS, body: { paths: [] } },
  { label: "test-notification", url: TEST_NOTIFICATION, body: {} },
] as const;

for (const route of ROUTES) {
  test.describe(`POST /api/internal/${route.label} — unauthenticated`, () => {
    test("returns 401 with no Authorization header", async ({ request }) => {
      const res = await request.post(route.url, { data: route.body });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test("returns 401 with a malformed Bearer token", async ({ request }) => {
      const res = await request.post(route.url, {
        data: route.body,
        headers: { Authorization: "Bearer invalid-token-for-testing" },
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test("returns 401 with Authorization missing Bearer prefix", async ({ request }) => {
      const res = await request.post(route.url, {
        data: route.body,
        headers: { Authorization: "not-a-bearer-token" },
      });
      expect(res.status()).toBe(401);
    });
  });
}

// ---------------------------------------------------------------------------
// Authenticated success — /api/internal/signed-urls (non-mutating)
// paths:[] returns {} immediately without reading or writing storage.
// Skips when SUPABASE_TEST_ACCESS_TOKEN is absent.
// ---------------------------------------------------------------------------

test.describe("POST /api/internal/signed-urls — authenticated (non-mutating)", () => {
  test.beforeEach(() => {
    if (!process.env.SUPABASE_TEST_ACCESS_TOKEN) {
      test.skip(
        true,
        "SUPABASE_TEST_ACCESS_TOKEN not set — set it in .env.test.local to run authenticated internal-api tests",
      );
    }
  });

  test("returns 200 with empty paths array", async ({ request }) => {
    const res = await request.post(SIGNED_URLS, {
      data: { paths: [] },
      headers: { Authorization: `Bearer ${process.env.SUPABASE_TEST_ACCESS_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// Authenticated success — /api/internal/design-signed-urls (non-mutating)
// Same rationale as signed-urls above.
// ---------------------------------------------------------------------------

test.describe("POST /api/internal/design-signed-urls — authenticated (non-mutating)", () => {
  test.beforeEach(() => {
    if (!process.env.SUPABASE_TEST_ACCESS_TOKEN) {
      test.skip(
        true,
        "SUPABASE_TEST_ACCESS_TOKEN not set — set it in .env.test.local to run authenticated internal-api tests",
      );
    }
  });

  test("returns 200 with empty paths array", async ({ request }) => {
    const res = await request.post(DESIGN_SIGNED_URLS, {
      data: { paths: [] },
      headers: { Authorization: `Bearer ${process.env.SUPABASE_TEST_ACCESS_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });
});
