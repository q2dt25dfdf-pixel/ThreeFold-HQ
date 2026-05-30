/**
 * Phase 4 — AI API endpoint smoke tests.
 *
 * Uses Playwright's request fixture (pure HTTP, no browser).
 * Runs under the "api" project which has no browser setup and no auth dependency.
 *
 * Authenticated tests require AI_API_SECRET in the environment.
 * When it is absent they skip individually with a clear reason.
 * The secret is never logged, printed, hardcoded, or included in assertions.
 *
 * No data is created, modified, or deleted.
 */

import { test, expect } from "@playwright/test";

const HEALTH = "/api/ai/health";
const SUMMARY = "/api/ai/summary";

// ---------------------------------------------------------------------------
// GET /api/ai/health  (no auth required)
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/health", () => {
  test("returns 200 and ok: true without any auth", async ({ request }) => {
    const res = await request.get(HEALTH);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
  });

  test("response includes meta.as_of timestamp", async ({ request }) => {
    const res = await request.get(HEALTH);
    const body = await res.json();
    expect(typeof body.meta?.as_of).toBe("string");
    // Sanity-check it parses as a real ISO date.
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(HEALTH);
    // Playwright normalises header names to lowercase.
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/summary — unauthenticated (no secret needed)
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/summary — unauthenticated", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get(SUMMARY);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with a malformed Bearer token", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: "Bearer invalid-test-token" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("returns 401 with Authorization header missing Bearer prefix", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: "not-a-bearer-token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/summary — authenticated
// All tests in this block skip when AI_API_SECRET is not set in env.
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/summary — authenticated", () => {
  test.beforeEach(() => {
    if (!process.env.AI_API_SECRET) {
      test.skip(
        true,
        "AI_API_SECRET not set in environment — set it in .env.test.local to run authenticated tests",
      );
    }
  });

  test("returns 200 with the correct token", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data contains only expected aggregate sections and numeric fields", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    // Top-level sections match the documented contract.
    expect(Object.keys(data).sort()).toEqual(["crm", "finances", "invoices", "orders", "tasks"]);

    // Every field is a number (counts and dollar totals only — no strings, no objects).
    expect(typeof data.tasks.open).toBe("number");
    expect(typeof data.tasks.overdue).toBe("number");
    expect(typeof data.orders.active).toBe("number");
    expect(typeof data.orders.dueSoon).toBe("number");
    expect(typeof data.invoices.unpaid).toBe("number");
    expect(typeof data.invoices.outstandingBalance).toBe("number");
    expect(typeof data.finances.revenueCollectedThisMonth).toBe("number");
    expect(typeof data.finances.salesTaxOwed).toBe("number");
    expect(typeof data.crm.activeLeads).toBe("number");
    expect(typeof data.crm.pipelineValue).toBe("number");

    // Values are non-negative (sanity check — business figures can't be negative here).
    for (const section of Object.values(data) as Record<string, number>[]) {
      for (const val of Object.values(section)) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("response does not expose PII or raw row field names", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();

    // Check that known PII and raw-data field names are absent as JSON keys.
    // The pattern "key": (with colon) matches key names without false-positives
    // from values that may contain these words.
    const forbidden = [
      '"email":',
      '"phone":',
      '"address":',
      '"notes":',
      '"contact":',
      '"stripe":',
      '"stripe_invoice_url":',
      '"payment_link":',
      '"client_email":',
      '"client_phone":',
      '"client_name":',
      '"order_name":',
    ];
    for (const key of forbidden) {
      expect(bodyText, `Response must not expose raw field ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(SUMMARY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});
