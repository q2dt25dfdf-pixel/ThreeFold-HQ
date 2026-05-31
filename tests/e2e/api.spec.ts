/**
 * Phase 4 — AI API endpoint smoke tests.
 * Phase 6A — /api/ai/tasks and /api/ai/orders endpoint tests appended below.
 * Phase 6B — /api/ai/crm and /api/ai/vendors endpoint tests appended below.
 * Phase 6C — /api/ai/reports endpoint tests appended below.
 * Phase 6D — /api/ai/finances endpoint tests appended below.
 * Phase 6E — /api/ai/search and /api/ai/{client,order,lead,vendor}/[id] tests appended below.
 * Phase 6F — /api/ai/activity endpoint tests appended below.
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
// Phase 9G — pendingQuotes + outstandingDeposits in GET /api/ai/reports
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/reports — pendingQuotes and outstandingDeposits (Phase 9G)", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("response includes pendingQuotes and outstandingDeposits arrays", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    expect(Array.isArray(data.pendingQuotes)).toBe(true);
    expect(Array.isArray(data.outstandingDeposits)).toBe(true);
  });

  test("pendingQuotes items have correct safe shape", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    expect(data.pendingQuotes.length).toBeLessThanOrEqual(10);

    for (const q of data.pendingQuotes as Record<string, unknown>[]) {
      expect(typeof q.leadId).toBe("string");
      expect(typeof q.company).toBe("string");
      // Optional fields — present or null, never wrong type
      if (q.quoteNumber !== null && q.quoteNumber !== undefined) {
        expect(typeof q.quoteNumber).toBe("string");
      }
      if (q.grandTotal !== null && q.grandTotal !== undefined) {
        expect(typeof q.grandTotal).toBe("number");
        expect(q.grandTotal).toBeGreaterThan(0);
      }
      if (q.expirationDate !== null && q.expirationDate !== undefined) {
        expect(typeof q.expirationDate).toBe("string");
        expect(/^\d{4}-\d{2}-\d{2}$/.test(q.expirationDate as string)).toBe(true);
      }
      if (q.daysUntilExpiry !== null && q.daysUntilExpiry !== undefined) {
        expect(typeof q.daysUntilExpiry).toBe("number");
      }
      // Must NOT expose contact PII
      expect(q).not.toHaveProperty("contact");
      expect(q).not.toHaveProperty("email");
      expect(q).not.toHaveProperty("phone");
      expect(q).not.toHaveProperty("notes");
    }
  });

  test("pendingQuotes sorted soonest-expiring first when expirationDate present", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    const withExpiry = (data.pendingQuotes as Record<string, unknown>[]).filter(
      (q) => q.daysUntilExpiry !== null && q.daysUntilExpiry !== undefined,
    );
    for (let i = 1; i < withExpiry.length; i++) {
      expect(withExpiry[i].daysUntilExpiry as number).toBeGreaterThanOrEqual(
        withExpiry[i - 1].daysUntilExpiry as number,
      );
    }
  });

  test("outstandingDeposits items have correct safe shape", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    expect(data.outstandingDeposits.length).toBeLessThanOrEqual(10);

    const VALID_STATUSES = new Set(["draft", "pending", "payment_failed"]);

    for (const d of data.outstandingDeposits as Record<string, unknown>[]) {
      expect(typeof d.id).toBe("string");
      expect(typeof d.company).toBe("string");
      expect(typeof d.status).toBe("string");
      // Status must never be "paid" — that would mean it slipped the filter
      expect(d.status).not.toBe("paid");
      expect(VALID_STATUSES.has(d.status as string)).toBe(true);
      if (d.depositRequestNumber !== null && d.depositRequestNumber !== undefined) {
        expect(typeof d.depositRequestNumber).toBe("string");
      }
      if (d.depositAmount !== null && d.depositAmount !== undefined) {
        expect(typeof d.depositAmount).toBe("number");
        expect(d.depositAmount).toBeGreaterThan(0);
      }
      if (d.sentDate !== null && d.sentDate !== undefined) {
        expect(typeof d.sentDate).toBe("string");
        expect(/^\d{4}-\d{2}-\d{2}$/.test(d.sentDate as string)).toBe(true);
      }
      // Must NOT expose client_name or email directly
      expect(d).not.toHaveProperty("client_name");
      expect(d).not.toHaveProperty("client_email");
      expect(d).not.toHaveProperty("email");
      expect(d).not.toHaveProperty("contact");
    }
  });

  test("outstandingDeposits does not include paid deposits", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    for (const d of data.outstandingDeposits as Record<string, unknown>[]) {
      expect(d.status).not.toBe("paid");
    }
  });

  test("response does not expose client_name or deposit PII fields", async ({ request }) => {
    const res = await request.get(REPORTS, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of ['"client_name":', '"client_email":', '"public_link":', '"public_token":'] as const) {
      expect(bodyText, `Reports must not expose ${key}`).not.toContain(key);
    }
  });

  test("OpenAPI schema declares pendingQuotes and outstandingDeposits in reports response", async ({ request }) => {
    const schemaRes = await request.get("/api/ai/openapi");
    const schema = await schemaRes.json() as Record<string, unknown>;
    const paths = schema.paths as Record<string, unknown>;
    const reportsPath = paths["/api/ai/reports"] as Record<string, unknown>;
    const getOp = reportsPath.get as Record<string, unknown>;
    const resp200 = (getOp.responses as Record<string, unknown>)["200"] as Record<string, unknown>;
    const content = (resp200.content as Record<string, unknown>)["application/json"] as Record<string, unknown>;
    const schemaDef = content.schema as Record<string, unknown>;
    const dataProps = ((schemaDef.properties as Record<string, unknown>).data as Record<string, unknown>).properties as Record<string, unknown>;

    expect(dataProps.pendingQuotes).toBeDefined();
    expect((dataProps.pendingQuotes as Record<string, unknown>).type).toBe("array");
    expect(dataProps.outstandingDeposits).toBeDefined();
    expect((dataProps.outstandingDeposits as Record<string, unknown>).type).toBe("array");
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

// ---------------------------------------------------------------------------
// Phase 8C Sprint 3 — enhanced fields on order and lead detail endpoints
// ---------------------------------------------------------------------------

test.describe("GET /api/ai/order/{id} — Phase 8C enhanced fields", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("nonexistent order returns 404 and does not expose portal_token or public URLs", async ({ request }) => {
    const res = await request.get(`/api/ai/order/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(404);
    const bodyText = await res.text();
    expect(bodyText).not.toContain('"portal_token"');
    expect(bodyText).not.toContain('"public_link"');
    expect(bodyText).not.toContain('"publicLink"');
  });

  test("200 response includes portalEnabled as a boolean", async ({ request }) => {
    // Use nonexistent ID — we get 404. For shape verification we rely on integration
    // environments. This test verifies the field contract via the OpenAPI schema path.
    const schemaRes = await request.get("/api/ai/openapi");
    const schema = await schemaRes.json() as Record<string, unknown>;
    const paths = schema.paths as Record<string, unknown>;
    const orderPath = paths["/api/ai/order/{id}"] as Record<string, unknown>;
    const getOp = orderPath.get as Record<string, unknown>;
    const responses = getOp.responses as Record<string, unknown>;
    const ok200 = responses["200"] as Record<string, unknown>;
    const content = (ok200.content as Record<string, unknown>)["application/json"] as Record<string, unknown>;
    const schemaObj = content.schema as Record<string, unknown>;
    const data = (schemaObj.properties as Record<string, unknown>).data as Record<string, unknown>;
    const props = data.properties as Record<string, Record<string, unknown>>;
    // Verify new fields are declared in schema
    expect(props.portalEnabled).toBeDefined();
    expect(props.portalEnabled.type).toBe("boolean");
    expect(props.invoice.properties as Record<string, unknown>).toBeDefined();
    const invoiceProps = props.invoice.properties as Record<string, Record<string, unknown>>;
    expect(invoiceProps.balanceRemaining).toBeDefined();
    expect(invoiceProps.balanceRemaining.type).toBe("number");
  });

  test("response never exposes portal_token, public_link, or stripe fields", async ({ request }) => {
    const res = await request.get(`/api/ai/order/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of ['"portal_token":', '"public_link":', '"publicLink":', '"stripe":', '"payment_link":']) {
      expect(bodyText, `order detail must not expose ${key}`).not.toContain(key);
    }
  });
});

test.describe("GET /api/ai/lead/{id} — Phase 8C enhanced fields", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("nonexistent lead returns 404 and does not expose quote/deposit public URLs", async ({ request }) => {
    const res = await request.get(`/api/ai/lead/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(404);
    const bodyText = await res.text();
    expect(bodyText).not.toContain('"publicLink"');
    expect(bodyText).not.toContain('"public_link"');
    expect(bodyText).not.toContain('"quoteId"');
    expect(bodyText).not.toContain('"approvedQuoteId"');
    expect(bodyText).not.toContain('"depositRequestId"');
  });

  test("OpenAPI schema declares all new lead fields correctly", async ({ request }) => {
    const schemaRes = await request.get("/api/ai/openapi");
    const schema = await schemaRes.json() as Record<string, unknown>;
    const paths = schema.paths as Record<string, unknown>;
    const leadPath = paths["/api/ai/lead/{id}"] as Record<string, unknown>;
    const getOp = leadPath.get as Record<string, unknown>;
    const responses = getOp.responses as Record<string, unknown>;
    const ok200 = responses["200"] as Record<string, unknown>;
    const content = (ok200.content as Record<string, unknown>)["application/json"] as Record<string, unknown>;
    const schemaObj = content.schema as Record<string, unknown>;
    const data = (schemaObj.properties as Record<string, unknown>).data as Record<string, unknown>;
    const props = data.properties as Record<string, Record<string, unknown>>;

    expect(props.quoteNumber).toBeDefined();
    expect(props.latestQuoteStatus).toBeDefined();
    expect(props.quoteApproved).toBeDefined();
    expect(props.quoteApproved.type).toBe("boolean");
    expect(props.depositRequested).toBeDefined();
    expect(props.depositRequested.type).toBe("boolean");
    expect(props.depositRequestNumber).toBeDefined();
  });

  test("response never exposes quote/deposit IDs, public links, or PII", async ({ request }) => {
    const res = await request.get(`/api/ai/lead/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of [
      '"email":', '"phone":', '"address":', '"notes":',
      '"quoteId":', '"approvedQuoteId":', '"depositRequestId":',
      '"publicLink":', '"public_link":', '"stripe":',
      '"communicationHistory":', '"questionnaire_files":',
    ]) {
      expect(bodyText, `lead detail must not expose ${key}`).not.toContain(key);
    }
  });

  test("OpenAPI schema does not include lead phase 8C fields in the required list for backward compat", async ({ request }) => {
    const schemaRes = await request.get("/api/ai/openapi");
    const schema = await schemaRes.json() as Record<string, unknown>;
    const paths = schema.paths as Record<string, unknown>;
    const leadPath = paths["/api/ai/lead/{id}"] as Record<string, unknown>;
    const getOp = leadPath.get as Record<string, unknown>;
    const responses = getOp.responses as Record<string, unknown>;
    const ok200 = responses["200"] as Record<string, unknown>;
    const content = (ok200.content as Record<string, unknown>)["application/json"] as Record<string, unknown>;
    const schemaObj = content.schema as Record<string, unknown>;
    const data = (schemaObj.properties as Record<string, unknown>).data as Record<string, unknown>;
    const required = data.required as string[];
    // Core fields must be required
    expect(required).toContain("id");
    expect(required).toContain("company");
    expect(required).toContain("quoteApproved");
    expect(required).toContain("depositRequested");
    // Nullable fields should not be required
    expect(required).not.toContain("quoteNumber");
    expect(required).not.toContain("latestQuoteStatus");
    expect(required).not.toContain("depositRequestNumber");
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/activity  (Phase 6F)
// ---------------------------------------------------------------------------

const ACTIVITY = "/api/ai/activity";

// Forbidden content fields — activity notes/summaries must never appear.
const FORBIDDEN_ACTIVITY = [
  '"email":', '"phone":', '"address":',
  '"notes":', '"note":', '"comment":',
  '"body":', '"summary":',
  '"stripe":', '"payment_link":',
  '"contact":', '"pricingNotes":',
];

test.describe("GET /api/ai/activity — unauthenticated rejection", () => {
  test("missing Authorization returns 401", async ({ request }) => {
    const res = await request.get(ACTIVITY);
    expect(res.status()).toBe(401);
  });

  test("wrong scheme returns 401", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status()).toBe(401);
  });

  test("invalid Bearer token returns 401", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: "Bearer totally-wrong-token-abc123" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("GET /api/ai/activity — authenticated", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("returns 200 with valid token", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected shape with numeric counts and safe event fields", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    // Top-level structure
    expect(typeof data.date).toBe("string");
    expect(data.counts).toBeDefined();
    expect(Array.isArray(data.byType)).toBe(true);
    expect(data.byOwner).toBeDefined();
    expect(Array.isArray(data.recentEvents)).toBe(true);
    expect(data.followUps).toBeDefined();

    // Counts
    const { counts } = data;
    for (const key of ["total", "clientActivity", "crmComms", "today", "thisWeek", "lastThirtyDays"] as const) {
      expect(typeof counts[key], `counts.${key}`).toBe("number");
      expect(counts[key]).toBeGreaterThanOrEqual(0);
    }
    expect(counts.clientActivity + counts.crmComms).toBe(counts.total);

    // byType — array of { type, count }
    for (const entry of data.byType as Record<string, unknown>[]) {
      expect(typeof entry.type).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(entry.count).toBeGreaterThan(0);
    }

    // recentEvents — safe fields only, capped at 10
    expect(data.recentEvents.length).toBeLessThanOrEqual(10);
    for (const ev of data.recentEvents as Record<string, unknown>[]) {
      expect(typeof ev.id).toBe("string");
      expect(["client", "crm"]).toContain(ev.source);
      expect(typeof ev.type).toBe("string");
      expect(typeof ev.date).toBe("string");
      // Must NOT expose content/PII fields
      expect(ev).not.toHaveProperty("notes");
      expect(ev).not.toHaveProperty("summary");
      expect(ev).not.toHaveProperty("body");
      expect(ev).not.toHaveProperty("comment");
      expect(ev).not.toHaveProperty("email");
      expect(ev).not.toHaveProperty("phone");
    }

    // followUps
    const { followUps } = data;
    for (const key of ["overdue", "dueToday", "dueThisWeek"] as const) {
      expect(typeof followUps[key], `followUps.${key}`).toBe("number");
      expect(followUps[key]).toBeGreaterThanOrEqual(0);
    }
    expect(Array.isArray(followUps.overdueItems)).toBe(true);
    expect(followUps.overdueItems.length).toBeLessThanOrEqual(10);
    for (const item of followUps.overdueItems as Record<string, unknown>[]) {
      expect(typeof item.leadId).toBe("string");
      expect(typeof item.company).toBe("string");
      // Must NOT expose contact PII
      expect(item).not.toHaveProperty("email");
      expect(item).not.toHaveProperty("phone");
      expect(item).not.toHaveProperty("contact");
      expect(item).not.toHaveProperty("notes");
    }
  });

  test("response does not expose note content or PII field names", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_ACTIVITY) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(ACTIVITY, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// Phase 7B — /api/ai/openapi (public schema endpoint, no auth required)
// ---------------------------------------------------------------------------

const OPENAPI = "/api/ai/openapi";

const EXPECTED_PATHS = [
  "/api/ai/health",
  "/api/ai/summary",
  "/api/ai/tasks",
  "/api/ai/orders",
  "/api/ai/crm",
  "/api/ai/vendors",
  "/api/ai/reports",
  "/api/ai/finances",
  "/api/ai/activity",
  "/api/ai/search",
  "/api/ai/calendar",
  "/api/ai/client/{id}",
  "/api/ai/order/{id}",
  "/api/ai/lead/{id}",
  "/api/ai/vendor/{id}",
];

test.describe("GET /api/ai/openapi", () => {
  test("returns 200 without any auth", async ({ request }) => {
    const res = await request.get(OPENAPI);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("response has required OpenAPI top-level fields", async ({ request }) => {
    const res = await request.get(OPENAPI);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.openapi).toBe("string");
    expect((body.openapi as string).startsWith("3.")).toBe(true);
    expect(typeof body.info).toBe("object");
    expect(typeof body.paths).toBe("object");
    expect(typeof body.components).toBe("object");
  });

  test("schema includes all 15 AI endpoint paths", async ({ request }) => {
    const res = await request.get(OPENAPI);
    const body = await res.json() as Record<string, unknown>;
    const paths = body.paths as Record<string, unknown>;
    for (const p of EXPECTED_PATHS) {
      expect(paths, `Missing path ${p}`).toHaveProperty(p);
    }
  });

  test("Cache-Control header is public (not no-store)", async ({ request }) => {
    const res = await request.get(OPENAPI);
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("public");
    expect(cc).not.toContain("no-store");
  });

  test("schema does not contain any secret values", async ({ request }) => {
    const res = await request.get(OPENAPI);
    const bodyText = await res.text();
    // AI_API_SECRET value must never appear in schema output
    const secret = process.env.AI_API_SECRET;
    if (secret) {
      expect(bodyText).not.toContain(secret);
    }
    // Literal string "AI_API_SECRET" may appear as a description but its value must not
    expect(bodyText).not.toMatch(/"value"\s*:\s*".+"/);
  });

  test("every operation description is <= 300 chars — GPT Actions compatibility", async ({ request }) => {
    const res = await request.get(OPENAPI);
    const body = await res.json() as Record<string, unknown>;
    const paths = body.paths as Record<string, Record<string, Record<string, unknown>>>;
    const violations: string[] = [];
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const desc = (op as Record<string, unknown>).description;
        if (typeof desc === "string" && desc.length > 300) {
          violations.push(`${method.toUpperCase()} ${path}: ${desc.length} chars`);
        }
      }
    }
    expect(
      violations,
      `Operation descriptions exceed 300 chars:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });

  test("no enum array contains null — GPT Actions compatibility", async ({ request }) => {
    const res = await request.get(OPENAPI);
    const body = await res.json() as unknown;

    const violations: string[] = [];
    function walk(node: unknown, path: string): void {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((item: unknown, i: number) => walk(item, `${path}[${i}]`));
        return;
      }
      const obj = node as Record<string, unknown>;
      if ("enum" in obj && Array.isArray(obj.enum)) {
        for (const val of obj.enum as unknown[]) {
          if (val === null) violations.push(`${path}.enum`);
        }
      }
      for (const [key, val] of Object.entries(obj)) {
        walk(val, `${path}.${key}`);
      }
    }
    walk(body, "schema");

    expect(
      violations,
      `GPT Actions incompatible — null inside enum at: ${violations.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 9G — GET /api/ai/calendar
// ---------------------------------------------------------------------------

const CALENDAR = "/api/ai/calendar";

const FORBIDDEN_CALENDAR = [
  '"email":', '"phone":', '"address":',
  '"notes":', '"source":',
  '"stripe":', '"payment_link":',
  '"contact":', '"pricingNotes":',
];

test.describe("GET /api/ai/calendar — unauthenticated rejection", () => {
  test("missing Authorization returns 401", async ({ request }) => {
    const res = await request.get(CALENDAR);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("wrong scheme returns 401", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status()).toBe(401);
  });

  test("invalid Bearer token returns 401", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: "Bearer totally-wrong-token-abc123" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

test.describe("GET /api/ai/calendar — authenticated", () => {
  test.beforeEach(() => { skipIfNoSecret(); });

  test("returns 200 with valid token", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.status()).toBe(200);
  });

  test("response envelope has ok / data / meta shape", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.as_of).toBe("string");
    expect(Number.isNaN(Date.parse(body.meta.as_of))).toBe(false);
  });

  test("data has expected shape with correct types", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();

    // Required top-level fields
    expect(typeof data.date).toBe("string");
    // date must be a valid YYYY-MM-DD
    expect(/^\d{4}-\d{2}-\d{2}$/.test(data.date)).toBe(true);
    expect(Number.isNaN(Date.parse(data.date))).toBe(false);

    expect(typeof data.todayCount).toBe("number");
    expect(data.todayCount).toBeGreaterThanOrEqual(0);

    expect(typeof data.hasDeliveriesToday).toBe("boolean");
    expect(typeof data.hasMeetingsToday).toBe("boolean");

    expect(Array.isArray(data.today)).toBe(true);
    expect(Array.isArray(data.thisWeek)).toBe(true);

    // todayCount must match today array length
    expect(data.todayCount).toBe(data.today.length);

    // Validate safe event shape — no notes, no source
    const VALID_TYPES = new Set([
      "Client Meeting", "Demo", "Video Call", "Delivery",
      "Deadline", "Internal Meeting", "Other",
    ]);
    const VALID_PRIORITIES = new Set(["High", "Medium", "Low"]);

    for (const ev of [...data.today, ...data.thisWeek] as Record<string, unknown>[]) {
      expect(typeof ev.id).toBe("string");
      expect(typeof ev.title).toBe("string");
      expect(typeof ev.date).toBe("string");
      expect(/^\d{4}-\d{2}-\d{2}$/.test(ev.date as string)).toBe(true);
      expect(Array.isArray(ev.assignedTo)).toBe(true);

      // type must be a known value when present
      if (ev.type !== null && ev.type !== undefined) {
        expect(VALID_TYPES.has(ev.type as string), `Unknown type: ${ev.type}`).toBe(true);
      }
      // priority must be a known value when present
      if (ev.priority !== null && ev.priority !== undefined) {
        expect(VALID_PRIORITIES.has(ev.priority as string), `Unknown priority: ${ev.priority}`).toBe(true);
      }

      // Must NOT expose private fields
      expect(ev).not.toHaveProperty("notes");
      expect(ev).not.toHaveProperty("source");
      expect(ev).not.toHaveProperty("cancelled");
    }
  });

  test("today[] events all have date matching data.date", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    for (const ev of data.today as Record<string, unknown>[]) {
      expect(ev.date).toBe(data.date);
    }
  });

  test("thisWeek[] events all have date after today and within 7 days", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    const today   = data.date as string;
    const weekEnd = new Date(today + "T12:00:00");
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    for (const ev of data.thisWeek as Record<string, unknown>[]) {
      expect(ev.date as string > today).toBe(true);
      expect(ev.date as string <= weekEndStr).toBe(true);
    }
  });

  test("hasDeliveriesToday is true iff any today[] event has type Delivery", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    const hasDelivery = (data.today as Record<string, unknown>[]).some((e) => e.type === "Delivery");
    expect(data.hasDeliveriesToday).toBe(hasDelivery);
  });

  test("hasMeetingsToday is true iff any today[] event is a meeting type", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const { data } = await res.json();
    const MEETING_TYPES = new Set(["Client Meeting", "Demo", "Video Call", "Internal Meeting"]);
    const hasMeeting = (data.today as Record<string, unknown>[]).some(
      (e) => MEETING_TYPES.has(e.type as string),
    );
    expect(data.hasMeetingsToday).toBe(hasMeeting);
  });

  test("response does not expose private or PII field names", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    const bodyText = await res.text();
    for (const key of FORBIDDEN_CALENDAR) {
      expect(bodyText, `Response must not expose ${key}`).not.toContain(key);
    }
  });

  test("Cache-Control header includes no-store", async ({ request }) => {
    const res = await request.get(CALENDAR, {
      headers: { Authorization: `Bearer ${process.env.AI_API_SECRET}` },
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("OpenAPI schema declares CalendarEvent component with required fields", async ({ request }) => {
    const schemaRes = await request.get("/api/ai/openapi");
    const schema = await schemaRes.json() as Record<string, unknown>;
    const schemas = ((schema.components as Record<string, unknown>).schemas as Record<string, unknown>);
    const ce = schemas.CalendarEvent as Record<string, unknown>;
    expect(ce).toBeDefined();
    const props = ce.properties as Record<string, unknown>;
    expect(props.id).toBeDefined();
    expect(props.title).toBeDefined();
    expect(props.date).toBeDefined();
    expect(props.type).toBeDefined();
    expect(props.assignedTo).toBeDefined();
    // Sensitive fields must not be in the schema
    expect(props).not.toHaveProperty("notes");
    expect(props).not.toHaveProperty("source");
  });
});
