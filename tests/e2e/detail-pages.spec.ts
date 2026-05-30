/**
 * Phase 3a — Detail page navigation smoke tests.
 *
 * Each test navigates to the list, clicks into the first available record,
 * and confirms the detail page renders without errors (back-nav button visible).
 *
 * Tests that require real data use a conditional skip so an empty database
 * doesn't produce a hard failure — it reports "skipped" with a reason.
 *
 * No data is created, modified, or deleted.
 *
 * SKIPPED: /crm/leads/[id] — this questionnaire detail page is only reachable
 * by clicking the "Questionnaire" button inside the CRM lead detail modal,
 * which itself requires a lead with questionnaire data. Testing it without a
 * known ID would be brittle. Covered by the CRM lead modal test in modals.spec.ts.
 */

import { test, expect } from "../fixtures/auth.fixture";

// ---------------------------------------------------------------------------
// Orders  /orders → /orders/[id]
// ---------------------------------------------------------------------------

test.describe("Orders detail (/orders/[id])", () => {
  test("opens first order and detail page loads without errors", async ({ hqPage }) => {
    await hqPage.goto("/orders");
    await expect(
      hqPage.getByRole("heading", { name: "Orders queue", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    const viewBtn = hqPage.getByRole("button", { name: "View order" }).first();
    if ((await viewBtn.count()) === 0) {
      test.skip(true, "No orders in database — detail navigation skipped");
      return;
    }

    await viewBtn.click();

    // The detail page renders a back-nav "Orders" button immediately once data loads.
    await expect(
      hqPage.getByRole("button", { name: "Orders" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ---------------------------------------------------------------------------
// Clients  /clients → /clients/[id]
// ---------------------------------------------------------------------------

test.describe("Clients detail (/clients/[id])", () => {
  test("opens first client and detail page loads without errors", async ({ hqPage }) => {
    await hqPage.goto("/clients");
    await expect(
      hqPage.getByRole("heading", { name: "Client accounts", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    // Client list rows are <div role="button"> elements that navigate on click.
    const firstRow = hqPage.locator("div[role='button']").first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, "No clients in database — detail navigation skipped");
      return;
    }

    await firstRow.click();

    // Detail page back-nav button
    await expect(
      hqPage.getByRole("button", { name: "Clients" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ---------------------------------------------------------------------------
// Vendors  /vendors → /vendors/[id]
// ---------------------------------------------------------------------------

test.describe("Vendors detail (/vendors/[id])", () => {
  test("opens first vendor and detail page loads without errors", async ({ hqPage }) => {
    await hqPage.goto("/vendors");
    await expect(
      hqPage.getByRole("heading", { name: "Vendor network", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    // Vendor cards are <article role="button"> elements.
    const firstCard = hqPage.locator("article[role='button']").first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No vendors in database — detail navigation skipped");
      return;
    }

    await firstCard.click();

    // Detail page back-nav button
    await expect(
      hqPage.getByRole("button", { name: "Vendors" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
