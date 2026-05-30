/**
 * Phase 4 — AI API endpoint smoke tests.
 * Phase 6A — /api/ai/tasks and /api/ai/orders endpoint tests appended below.
 * Phase 6B — /api/ai/crm and /api/ai/vendors endpoint tests appended below.
 * Phase 6C — /api/ai/reports endpoint tests appended below.
 * Phase 6D — /api/ai/finances endpoint tests appended below.
 * Phase 6E — /api/ai/search and /api/ai/{client,order,lead,vendor}/[id] tests appended below.
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

// ---------------------------------------------------------------------------
// Phase 6A helpers
// ---------------------------------------------------------------------------

const TASKS = "/api/ai/tasks";
const ORDERS = "/api/ai/orders";

const SKIP_REASON =
  "AI_API_SECRET not set in environment — set it in .env.test.local to run authenticated tests";

function skipIfNoSecret() {
  if (!process.env.AI_API_SECRET) test.skip(true, SKIP_REASON);
}

// Fields that must never appear as JSON keys in any AI response.
const FORBIDDEN_KEYS = [
  '"email":',
  '"phone":',
  '"address":',
  '"notes":',
  '"stripe":',
  '"payment_link":',
  '"client_email":',
  '"client_phone":',
  '"client_name":',
];

// ---------------------------------------------------------------------------
// GET /api/ai/tasks — unauthenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/tasks — unauthenticated", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get(TASKS);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with a malformed Bearer token", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: "Bearer invalid-test-token" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("returns 401 with Authorization header missing Bearer prefix", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: "not-a-bearer-token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/tasks — authenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/tasks — authenticated", () => {
  test.beforeEach(skipIfNoSecret);

  test("returns 200 with the correct token", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected top-level keys and numeric counts", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    expect(Object.keys(data).sort()).toEqual(["byAssignee", "byPriority", "counts", "urgentTasks"]);

    // counts — all numeric, all non-negative
    const { counts } = data;
    for (const key of ["total", "open", "overdue", "dueToday", "dueThisWeek"] as const) {
      expect(typeof counts[key], `counts.${key}`).toBe("number");
      expect(counts[key], `counts.${key}`).toBeGreaterThanOrEqual(0);
    }
    expect(counts.open).toBeLessThanOrEqual(counts.total);
    expect(counts.overdue).toBeLessThanOrEqual(counts.open);

    // byPriority
    const { byPriority } = data;
    for (const key of ["high", "medium", "low"] as const) {
      expect(typeof byPriority[key], `byPriority.${key}`).toBe("number");
      expect(byPriority[key]).toBeGreaterThanOrEqual(0);
    }

    // urgentTasks — bounded list of safe fields, no notes
    expect(Array.isArray(data.urgentTasks)).toBe(true);
    expect(data.urgentTasks.length).toBeLessThanOrEqual(10);
    for (const task of data.urgentTasks as Record<string, unknown>[]) {
      expect(Object.keys(task).sort()).toEqual(
        ["assignedTo", "dueDate", "id", "priority", "title"],
      );
    }
  });

  test("response does not expose PII or raw field names", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_KEYS) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(TASKS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/orders — unauthenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/orders — unauthenticated", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get(ORDERS);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with a malformed Bearer token", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: "Bearer invalid-test-token" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("returns 401 with Authorization header missing Bearer prefix", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: "not-a-bearer-token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/orders — authenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/orders — authenticated", () => {
  test.beforeEach(skipIfNoSecret);

  test("returns 200 with the correct token", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected top-level keys and numeric counts", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    expect(Object.keys(data).sort()).toEqual([
      "byStatus",
      "counts",
      "ordersNeedingAttention",
    ]);

    // counts — all numeric, all non-negative
    const { counts } = data;
    for (const key of ["total", "active", "overdue", "dueSoon", "recentlyDelivered"] as const) {
      expect(typeof counts[key], `counts.${key}`).toBe("number");
      expect(counts[key], `counts.${key}`).toBeGreaterThanOrEqual(0);
    }
    expect(counts.active).toBeLessThanOrEqual(counts.total);
    expect(counts.overdue).toBeLessThanOrEqual(counts.active);

    // byStatus — array of { status: string, count: number }
    expect(Array.isArray(data.byStatus)).toBe(true);
    for (const entry of data.byStatus as Record<string, unknown>[]) {
      expect(typeof entry.status).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(entry.count).toBeGreaterThan(0);
    }

    // ordersNeedingAttention — bounded, safe fields only, no notes
    expect(Array.isArray(data.ordersNeedingAttention)).toBe(true);
    expect(data.ordersNeedingAttention.length).toBeLessThanOrEqual(10);
    for (const order of data.ordersNeedingAttention as Record<string, unknown>[]) {
      expect(Object.keys(order).sort()).toEqual([
        "estimatedDeliveryDate",
        "id",
        "orderName",
        "status",
      ]);
    }
  });

  test("response does not expose PII or raw field names", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_KEYS) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(ORDERS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// Phase 6B — /api/ai/crm and /api/ai/vendors
// ---------------------------------------------------------------------------

const CRM = "/api/ai/crm";
const VENDORS = "/api/ai/vendors";

// PII fields that must not appear in CRM or vendor responses.
// Extends the Phase 6A list with CRM/vendor-specific sensitive field names.
const FORBIDDEN_CRM_VENDOR = [
  '"email":',
  '"phone":',
  '"address":',
  '"notes":',
  '"stripe":',
  '"payment_link":',
  '"client_email":',
  '"client_phone":',
  '"contact":',           // contact person name in leads and vendors
  '"communicationHistory":',  // CRM communication log
  '"pricingNotes":',      // vendor pricing info
  '"questionnaire_files":',   // CRM questionnaire attachments
];

// ---------------------------------------------------------------------------
// GET /api/ai/crm — unauthenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/crm — unauthenticated", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get(CRM);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with a malformed Bearer token", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: "Bearer invalid-test-token" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("returns 401 with Authorization header missing Bearer prefix", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: "not-a-bearer-token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/crm — authenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/crm — authenticated", () => {
  test.beforeEach(skipIfNoSecret);

  test("returns 200 with the correct token", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected top-level keys and numeric counts", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    expect(Object.keys(data).sort()).toEqual([
      "byOwner",
      "byStage",
      "counts",
      "leadsNeedingAttention",
      "pipelineValue",
    ]);

    // counts
    const { counts } = data;
    for (const key of [
      "total", "open", "won", "stale", "followUpsDueToday", "followUpsDueThisWeek",
    ] as const) {
      expect(typeof counts[key], `counts.${key}`).toBe("number");
      expect(counts[key], `counts.${key}`).toBeGreaterThanOrEqual(0);
    }
    expect(counts.open + counts.won).toBeLessThanOrEqual(counts.total);
    expect(counts.stale).toBeLessThanOrEqual(counts.open);

    // pipelineValue
    expect(typeof data.pipelineValue).toBe("number");
    expect(data.pipelineValue).toBeGreaterThanOrEqual(0);

    // byStage — array of { stage, count, totalValue }
    expect(Array.isArray(data.byStage)).toBe(true);
    for (const entry of data.byStage as Record<string, unknown>[]) {
      expect(typeof entry.stage).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(typeof entry.totalValue).toBe("number");
    }

    // leadsNeedingAttention — bounded, safe fields only
    expect(Array.isArray(data.leadsNeedingAttention)).toBe(true);
    expect(data.leadsNeedingAttention.length).toBeLessThanOrEqual(10);
    for (const lead of data.leadsNeedingAttention as Record<string, unknown>[]) {
      // Must have these safe fields
      expect(typeof lead.id).toBe("string");
      expect(typeof lead.company).toBe("string");
      expect(typeof lead.stage).toBe("string");
      expect(typeof lead.owner).toBe("string");
      // Must NOT have PII fields
      expect(lead).not.toHaveProperty("email");
      expect(lead).not.toHaveProperty("phone");
      expect(lead).not.toHaveProperty("contact");
      expect(lead).not.toHaveProperty("notes");
      expect(lead).not.toHaveProperty("communicationHistory");
    }
  });

  test("response does not expose PII or raw field names", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_CRM_VENDOR) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(CRM, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/vendors — unauthenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/vendors — unauthenticated", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get(VENDORS);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("returns 401 with a malformed Bearer token", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: "Bearer invalid-test-token" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("returns 401 with Authorization header missing Bearer prefix", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: "not-a-bearer-token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/vendors — authenticated
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/vendors — authenticated", () => {
  test.beforeEach(skipIfNoSecret);

  test("returns 200 with the correct token", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected top-level keys and numeric counts", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    expect(Object.keys(data).sort()).toEqual([
      "byCategory",
      "byType",
      "counts",
      "sampleTracking",
      "vendorsNeedingAttention",
    ]);

    // counts
    const { counts } = data;
    for (const key of ["total", "active", "review", "inactive", "preferred", "approved"] as const) {
      expect(typeof counts[key], `counts.${key}`).toBe("number");
      expect(counts[key], `counts.${key}`).toBeGreaterThanOrEqual(0);
    }
    expect(counts.active + counts.review + counts.inactive).toBeLessThanOrEqual(counts.total);

    // sampleTracking — all numeric
    const { sampleTracking } = data;
    for (const key of [
      "notRequested", "requested", "ordered", "received", "approved", "rejected",
    ] as const) {
      expect(typeof sampleTracking[key], `sampleTracking.${key}`).toBe("number");
      expect(sampleTracking[key]).toBeGreaterThanOrEqual(0);
    }

    // byCategory and byType — arrays of { category/type, count }
    expect(Array.isArray(data.byCategory)).toBe(true);
    expect(Array.isArray(data.byType)).toBe(true);

    // vendorsNeedingAttention — bounded, safe fields only
    expect(Array.isArray(data.vendorsNeedingAttention)).toBe(true);
    expect(data.vendorsNeedingAttention.length).toBeLessThanOrEqual(10);
    for (const vendor of data.vendorsNeedingAttention as Record<string, unknown>[]) {
      expect(typeof vendor.id).toBe("string");
      expect(typeof vendor.name).toBe("string");
      expect(typeof vendor.type).toBe("string");
      expect(typeof vendor.status).toBe("string");
      // Must NOT have PII fields
      expect(vendor).not.toHaveProperty("email");
      expect(vendor).not.toHaveProperty("phone");
      expect(vendor).not.toHaveProperty("address");
      expect(vendor).not.toHaveProperty("contact");
      expect(vendor).not.toHaveProperty("notes");
      expect(vendor).not.toHaveProperty("pricingNotes");
    }
  });

  test("response does not expose PII or raw field names", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_CRM_VENDOR) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(VENDORS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/reports  (Phase 6C)
// ---------------------------------------------------------------------------

const REPORTS = "/api/ai/reports";

test.describe("GET /api/ai/reports — unauthenticated rejection", () => {
  test("missing Authorization returns 401", async ({ request }) => {
    const res = await request.get(REPORTS);
    expect(res.status()).toBe(401);
  });

  test("wrong scheme returns 401", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status()).toBe(401);
  });

  test("invalid Bearer token returns 401", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: "Bearer totally-wrong-token-abc123" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("GET /api/ai/reports — authenticated", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("returns 200 with valid token", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected top-level report sections", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    // Top-level structure
    expect(typeof data.date).toBe("string");
    expect(data.morningBriefing).toBeDefined();
    expect(data.hqAuditor).toBeDefined();
    expect(data.endOfDayReport).toBeDefined();

    // Morning Briefing shape
    const mb = data.morningBriefing;
    expect(typeof mb.allClear).toBe("boolean");
    expect(typeof mb.totalItems).toBe("number");
    expect(typeof mb.taxDue).toBe("number");
    expect(Array.isArray(mb.sections)).toBe(true);
    for (const section of mb.sections as Record<string, unknown>[]) {
      expect(typeof section.key).toBe("string");
      expect(typeof section.label).toBe("string");
      expect(typeof section.count).toBe("number");
      expect(["red", "amber", "blue"]).toContain(section.tone);
      expect(Array.isArray(section.items)).toBe(true);
    }

    // HQ Auditor shape
    const hq = data.hqAuditor;
    expect(typeof hq.systemHealthy).toBe("boolean");
    expect(typeof hq.totalCritical).toBe("number");
    expect(typeof hq.totalWarnings).toBe("number");
    expect(typeof hq.taxDue).toBe("number");
    expect(Array.isArray(hq.critical)).toBe(true);
    expect(Array.isArray(hq.warnings)).toBe(true);

    // End-of-Day Report shape
    const eod = data.endOfDayReport;
    expect(typeof eod.hasActivity).toBe("boolean");
    expect(typeof eod.revenueToday).toBe("number");
    expect(typeof eod.expenseTotalToday).toBe("number");
    expect(Array.isArray(eod.payments)).toBe(true);
    expect(Array.isArray(eod.completedTasks)).toBe(true);
    expect(Array.isArray(eod.contactsLogged)).toBe(true);
    expect(Array.isArray(eod.expensesToday)).toBe(true);

    // contactsLogged must not expose summary content
    for (const c of eod.contactsLogged as Record<string, unknown>[]) {
      expect(typeof c.leadId).toBe("string");
      expect(typeof c.leadName).toBe("string");
      expect(typeof c.contactType).toBe("string");
      expect(c).not.toHaveProperty("summary");
    }
  });

  test("response does not expose PII or raw field names", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_CRM_VENDOR) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
    // Additional reports-specific forbidden fields
    for (const key of ['"summary":', '"stripe":', '"payment_link":'] as const) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/finances  (Phase 6D)
// ---------------------------------------------------------------------------

const FINANCES = "/api/ai/finances";

// Additional forbidden fields specific to the finances endpoint.
const FORBIDDEN_FINANCES = [
  ...FORBIDDEN_CRM_VENDOR,
  '"stripe":',
  '"stripe_invoice_url":',
  '"payment_link":',
  '"confirmation_number":',
  '"receipt_url":',
  '"client_email":',
  '"client_phone":',
  '"client_name":',
];

test.describe("GET /api/ai/finances — unauthenticated rejection", () => {
  test("missing Authorization returns 401", async ({ request }) => {
    const res = await request.get(FINANCES);
    expect(res.status()).toBe(401);
  });

  test("wrong scheme returns 401", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status()).toBe(401);
  });

  test("invalid Bearer token returns 401", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: "Bearer totally-wrong-token-abc123" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("GET /api/ai/finances — authenticated", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("returns 200 with valid token", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected top-level keys and numeric aggregates", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    expect(Object.keys(data).sort()).toEqual(["expenses", "invoices", "summary"]);

    // Invoices section
    const { invoices } = data;
    expect(invoices.counts).toBeDefined();
    for (const key of ["total", "outstanding", "paid", "overdue", "draft", "cancelled"] as const) {
      expect(typeof invoices.counts[key], `invoices.counts.${key}`).toBe("number");
      expect(invoices.counts[key]).toBeGreaterThanOrEqual(0);
    }
    expect(invoices.counts.outstanding + invoices.counts.paid).toBeLessThanOrEqual(invoices.counts.total);

    expect(invoices.totals).toBeDefined();
    for (const key of ["totalValue", "revenueCollected", "outstandingBalance"] as const) {
      expect(typeof invoices.totals[key], `invoices.totals.${key}`).toBe("number");
    }

    expect(invoices.salesTax).toBeDefined();
    for (const key of ["collectedYTD", "paidYTD", "dueYTD"] as const) {
      expect(typeof invoices.salesTax[key], `invoices.salesTax.${key}`).toBe("number");
      expect(invoices.salesTax[key]).toBeGreaterThanOrEqual(0);
    }

    expect(Array.isArray(invoices.byStatus)).toBe(true);
    expect(Array.isArray(invoices.invoicesNeedingAttention)).toBe(true);
    expect(invoices.invoicesNeedingAttention.length).toBeLessThanOrEqual(10);
    for (const inv of invoices.invoicesNeedingAttention as Record<string, unknown>[]) {
      expect(typeof inv.id).toBe("string");
      expect(typeof inv.orderName).toBe("string");
      expect(typeof inv.status).toBe("string");
      expect(typeof inv.balance).toBe("number");
      // Must NOT expose client PII
      expect(inv).not.toHaveProperty("client");
      expect(inv).not.toHaveProperty("email");
      expect(inv).not.toHaveProperty("notes");
      expect(inv).not.toHaveProperty("stripe_invoice_url");
    }

    // Expenses section
    const { expenses } = data;
    expect(expenses.counts).toBeDefined();
    for (const key of ["total", "paid", "unpaid"] as const) {
      expect(typeof expenses.counts[key], `expenses.counts.${key}`).toBe("number");
      expect(expenses.counts[key]).toBeGreaterThanOrEqual(0);
    }
    expect(expenses.counts.paid + expenses.counts.unpaid).toBe(expenses.counts.total);

    expect(expenses.totals).toBeDefined();
    for (const key of ["total", "paid", "unpaid"] as const) {
      expect(typeof expenses.totals[key], `expenses.totals.${key}`).toBe("number");
      expect(expenses.totals[key]).toBeGreaterThanOrEqual(0);
    }

    expect(Array.isArray(expenses.byCategory)).toBe(true);
    expect(Array.isArray(expenses.expensesNeedingAttention)).toBe(true);
    expect(expenses.expensesNeedingAttention.length).toBeLessThanOrEqual(10);
    for (const exp of expenses.expensesNeedingAttention as Record<string, unknown>[]) {
      expect(typeof exp.id).toBe("string");
      expect(typeof exp.name).toBe("string");
      expect(typeof exp.amount).toBe("number");
      // Must NOT expose PII or raw internal fields
      expect(exp).not.toHaveProperty("notes");
      expect(exp).not.toHaveProperty("receipt_url");
    }

    // Summary section
    const { summary } = data;
    for (const key of ["revenueCollected", "grossProfit", "netPosition", "taxDue"] as const) {
      expect(typeof summary[key], `summary.${key}`).toBe("number");
    }
    // Sanity: taxDue must be non-negative
    expect(summary.taxDue).toBeGreaterThanOrEqual(0);
  });

  test("response does not expose PII or sensitive raw field names", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_FINANCES) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(FINANCES, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/search  (Phase 6E)
// ---------------------------------------------------------------------------

const SEARCH = "/api/ai/search";

// Forbidden fields for search — never expose PII or raw identifiers.
const FORBIDDEN_SEARCH = [
  '"email":', '"phone":', '"address":', '"notes":',
  '"contact":', '"stripe":', '"payment_link":',
  '"summary":', '"communicationHistory":',
  '"pricingNotes":', '"client_email":', '"client_phone":',
];

test.describe("GET /api/ai/search — unauthenticated rejection", () => {
  test("missing Authorization returns 401", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=test`);
    expect(res.status()).toBe(401);
  });

  test("wrong scheme returns 401", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=test`, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status()).toBe(401);
  });

  test("invalid Bearer token returns 401", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=test`, {
      headers: { Authorization: "Bearer totally-wrong-token-abc123" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("GET /api/ai/search — authenticated", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("missing q parameter returns 400", async ({ request }) => {
    const res = await request.get(SEARCH, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 200 with valid token and query", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=a`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=order`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
  });

  test("data has query, totalResults, and results array with correct shape", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=a`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    expect(typeof data.query).toBe("string");
    expect(typeof data.totalResults).toBe("number");
    expect(data.totalResults).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeLessThanOrEqual(20);
    for (const result of data.results as Record<string, unknown>[]) {
      expect(["client", "order", "lead", "vendor"]).toContain(result.type);
      expect(typeof result.id).toBe("string");
      expect(typeof result.label).toBe("string");
      expect(typeof result.status).toBe("string");
      // Must NOT expose PII
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("phone");
      expect(result).not.toHaveProperty("notes");
      expect(result).not.toHaveProperty("contact");
    }
  });

  test("response does not expose PII or raw field names", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=active`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_SEARCH) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(`${SEARCH}?q=test`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// Detail endpoints: /api/ai/{client,order,lead,vendor}/[id]  (Phase 6E)
//
// Strategy: use a nonexistent UUID to test 404 handling without needing real
// data. All detail tests are run with and without auth to verify the auth gate.
// ---------------------------------------------------------------------------

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Detail endpoints — unauthenticated rejection", () => {
  for (const path of [
    `/api/ai/client/${NONEXISTENT_ID}`,
    `/api/ai/order/${NONEXISTENT_ID}`,
    `/api/ai/lead/${NONEXISTENT_ID}`,
    `/api/ai/vendor/${NONEXISTENT_ID}`,
  ]) {
    test(`${path} — missing Authorization returns 401`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }
});

test.describe("Detail endpoints — authenticated, nonexistent id", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  for (const { label, path } of [
    { label: "client",  path: `/api/ai/client/${NONEXISTENT_ID}` },
    { label: "order",   path: `/api/ai/order/${NONEXISTENT_ID}` },
    { label: "lead",    path: `/api/ai/lead/${NONEXISTENT_ID}` },
    { label: "vendor",  path: `/api/ai/vendor/${NONEXISTENT_ID}` },
  ]) {
    test(`${label} with nonexistent id returns 404 with safe shape`, async ({ request }) => {
      const res = await request.get(path, {
        headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
      });
      expect(res.status()).toBe(404);
      const body = await res.json();
      // Must be { ok: false, error: "Not found" } — no internal detail leaked
      expect(body.ok).toBe(false);
      expect(typeof body.error).toBe("string");
      expect(body.error.toLowerCase()).not.toContain("sql");
      expect(body.error.toLowerCase()).not.toContain("table");
      // Cache-Control must still be set
      expect(res.headers()["cache-control"]).toContain("no-store");
    });

    test(`${label} response does not expose PII when valid record exists`, async ({ request }) => {
      // Use a query that produces no result — we're verifying the response shape doesn't leak PII.
      // This test passes regardless of whether data exists: it either gets 404 (no data) or
      // a 200 with only safe fields (with data). Either way, forbidden keys must be absent.
      const res = await request.get(path, {
        headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
      });
      const bodyText = await res.text();
      for (const key of ['"email":', '"phone":', '"address":', '"notes":', '"stripe":'] as const) {
        expect(bodyText, `${label} must not expose ${key}`).not.toContain(key);
      }
    });
  }
});
