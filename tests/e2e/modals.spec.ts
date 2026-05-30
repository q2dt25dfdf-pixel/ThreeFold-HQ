/**
 * Phase 3b — Modal open/close smoke tests.
 *
 * Each test: opens a modal using the visible trigger button, confirms the
 * modal rendered (h2 title visible), then closes it with the ModalShell X
 * button (aria-label="Close"), and confirms it is gone.
 *
 * No form fields are filled. No submit/save buttons are clicked.
 * No data is created, modified, or deleted.
 *
 * The CRM lead detail modal test is conditional — it skips when no pipeline
 * lead cards exist, because the modal title is the lead's company name
 * (dynamic) and requires at least one real record.
 */

import { test, expect } from "../fixtures/auth.fixture";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clicks the ModalShell X button to close whatever modal is open, then
 * asserts the heading is no longer visible.
 */
async function closeModal(page: Page, modalHeading: string | RegExp) {
  // ModalShell renders one Close button per modal (same in mobile + desktop
  // layouts, only one is visible at a time). .first() is safe here.
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(
    page.getByRole("heading", { name: modalHeading, level: 2 }),
  ).not.toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Clients  — "Add client" modal
// ---------------------------------------------------------------------------

test.describe("Add client modal (/clients)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    await hqPage.goto("/clients");
    await expect(
      hqPage.getByRole("heading", { name: "Client accounts", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    await hqPage.getByRole("button", { name: "Add client" }).click();

    await expect(
      hqPage.getByRole("heading", { name: "Add client", level: 2 }),
    ).toBeVisible({ timeout: 8_000 });

    await closeModal(hqPage, "Add client");
  });
});

// ---------------------------------------------------------------------------
// Orders  — "Add order" modal
// ---------------------------------------------------------------------------

test.describe("Add order modal (/orders)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    await hqPage.goto("/orders");
    await expect(
      hqPage.getByRole("heading", { name: "Orders queue", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    await hqPage.getByRole("button", { name: "Add order" }).click();

    await expect(
      hqPage.getByRole("heading", { name: "Add order", level: 2 }),
    ).toBeVisible({ timeout: 8_000 });

    await closeModal(hqPage, "Add order");
  });
});

// ---------------------------------------------------------------------------
// Vendors  — "Add vendor" modal
// ---------------------------------------------------------------------------

test.describe("Add vendor modal (/vendors)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    await hqPage.goto("/vendors");
    await expect(
      hqPage.getByRole("heading", { name: "Vendor network", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    await hqPage.getByRole("button", { name: "Add vendor" }).click();

    await expect(
      hqPage.getByRole("heading", { name: "Add vendor", level: 2 }),
    ).toBeVisible({ timeout: 8_000 });

    await closeModal(hqPage, "Add vendor");
  });
});

// ---------------------------------------------------------------------------
// Tasks  — "Add task" modal
// ---------------------------------------------------------------------------

test.describe("Add task modal (/tasks)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    await hqPage.goto("/tasks");
    await expect(
      hqPage.getByRole("heading", { name: "Task board", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    await hqPage.getByRole("button", { name: "Add task" }).first().click();

    await expect(
      hqPage.getByRole("heading", { name: "Add task", level: 2 }),
    ).toBeVisible({ timeout: 8_000 });

    await closeModal(hqPage, "Add task");
  });
});

// ---------------------------------------------------------------------------
// Finances  — "Add invoice" modal  (/finances?tab=invoices)
// ---------------------------------------------------------------------------

test.describe("Add invoice modal (/finances)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    // Navigate directly to the Invoices tab via URL param to avoid clicking tabs.
    await hqPage.goto("/finances?tab=invoices");
    await expect(
      hqPage.getByRole("heading", { name: "Finances", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    await hqPage.getByRole("button", { name: "Add invoice" }).click();

    await expect(
      hqPage.getByRole("heading", { name: "Add invoice", level: 2 }),
    ).toBeVisible({ timeout: 8_000 });

    await closeModal(hqPage, "Add invoice");
  });
});

// ---------------------------------------------------------------------------
// Finances  — "Add Expense" modal  (/finances?tab=expenses)
// ---------------------------------------------------------------------------

test.describe("Add expense modal (/finances)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    await hqPage.goto("/finances?tab=expenses");
    await expect(
      hqPage.getByRole("heading", { name: "Finances", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    await hqPage.getByRole("button", { name: "Add Expense" }).click();

    await expect(
      hqPage.getByRole("heading", { name: "Add Expense", level: 2 }),
    ).toBeVisible({ timeout: 8_000 });

    await closeModal(hqPage, "Add Expense");
  });
});

// ---------------------------------------------------------------------------
// CRM  — Lead detail modal  (conditional on pipeline having at least one lead)
// ---------------------------------------------------------------------------

test.describe("CRM lead detail modal (/crm)", () => {
  test("opens and closes without errors", async ({ hqPage }) => {
    await hqPage.goto("/crm");
    await expect(
      hqPage.getByRole("heading", { name: "Manage leads across every stage", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });

    // Pipeline lead cards are <article role="button"> rendered by LeadCard.
    // Follow-up section articles do NOT carry role="button", so this targets
    // pipeline cards only.
    const firstCard = hqPage.locator("article[role='button']").first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "No leads in pipeline — CRM modal test skipped");
      return;
    }

    await firstCard.click();

    // Modal title is the lead's company name (dynamic). Assert via the
    // ModalShell Close button instead, which is always present.
    const closeBtn = hqPage.getByRole("button", { name: "Close" }).first();
    await expect(closeBtn).toBeVisible({ timeout: 8_000 });

    await closeBtn.click();
    await expect(closeBtn).not.toBeVisible({ timeout: 5_000 });
  });
});
