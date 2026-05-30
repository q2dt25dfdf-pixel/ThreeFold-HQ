/**
 * Phase 2 — Core page smoke tests.
 *
 * Each test: navigates to the route, waits for the h1 heading (proof that the
 * loading state resolved and data arrived), checks horizontal overflow, then
 * lets the hqPage fixture assert no console errors and no uncaught JS errors.
 *
 * No data is created, modified, or deleted. All interactions are read-only.
 */

import { test, expect } from "../fixtures/auth.fixture";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Waits for the page to exit its loading state by asserting the given h1 is
 * visible. Uses a generous timeout because Supabase round-trips can be slow on
 * cold starts.
 */
async function expectH1(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Returns true if the document layout is wider than the current viewport —
 * i.e. the page would scroll horizontally. A 1 px tolerance avoids false
 * positives from sub-pixel rounding.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

// ---------------------------------------------------------------------------
// Dashboard  /
// ---------------------------------------------------------------------------

test.describe("Dashboard (/)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/");
    await expectH1(hqPage, "Today at Threefold");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/");
    await expectH1(hqPage, "Today at Threefold");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CRM  /crm
// ---------------------------------------------------------------------------

test.describe("CRM (/crm)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/crm");
    await expectH1(hqPage, "Manage leads across every stage");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/crm");
    await expectH1(hqPage, "Manage leads across every stage");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Clients  /clients
// ---------------------------------------------------------------------------

test.describe("Clients (/clients)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/clients");
    await expectH1(hqPage, "Client accounts");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/clients");
    await expectH1(hqPage, "Client accounts");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Orders  /orders
// ---------------------------------------------------------------------------

test.describe("Orders (/orders)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/orders");
    await expectH1(hqPage, "Orders queue");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/orders");
    await expectH1(hqPage, "Orders queue");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vendors  /vendors
// ---------------------------------------------------------------------------

test.describe("Vendors (/vendors)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/vendors");
    await expectH1(hqPage, "Vendor network");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/vendors");
    await expectH1(hqPage, "Vendor network");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finances  /finances
// ---------------------------------------------------------------------------

test.describe("Finances (/finances)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/finances");
    await expectH1(hqPage, "Finances");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/finances");
    await expectH1(hqPage, "Finances");
    // The invoice table inside has its own overflow-x-auto container — that
    // scroll is intentional and stays clipped within its wrapper. What we
    // assert here is that the root document does not scroll horizontally.
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tasks  /tasks
// ---------------------------------------------------------------------------

test.describe("Tasks (/tasks)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/tasks");
    await expectH1(hqPage, "Task board");
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/tasks");
    await expectH1(hqPage, "Task board");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reports  /reports
// ---------------------------------------------------------------------------

test.describe("Reports (/reports)", () => {
  test("loads and shows heading", async ({ hqPage }) => {
    await hqPage.goto("/reports");
    // Reports h1 renders immediately (no global loading gate); panel content
    // loads asynchronously inside each panel.
    await expectH1(hqPage, "Reports");
  });

  test("all three report panels are present", async ({ hqPage }) => {
    await hqPage.goto("/reports");
    await expectH1(hqPage, "Reports");
    await expect(hqPage.getByRole("heading", { name: "Morning Briefing" })).toBeVisible();
    await expect(hqPage.getByRole("heading", { name: "End-of-Day Report" })).toBeVisible();
    await expect(hqPage.getByRole("heading", { name: "HQ Auditor" })).toBeVisible();
  });

  test("no horizontal overflow", async ({ hqPage }) => {
    await hqPage.goto("/reports");
    await expectH1(hqPage, "Reports");
    expect(await hasHorizontalOverflow(hqPage)).toBe(false);
  });
});
