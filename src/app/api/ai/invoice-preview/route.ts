import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { parseAmount, calcDeposit, calcTotal } from "@/lib/invoiceCalc";
import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";

export const dynamic = "force-dynamic";

// ── GET /api/ai/invoice-preview ────────────────────────────────────────────────
//
// Read-only preview of a finance/invoice record for Jarvis.
// NEVER calls /api/invoice/generate — that writes a public_token on first use.
// Only reads what already exists in finances and deposit_requests.
//
// Resolution priority:
//   1. invoiceId — direct id lookup
//   2. orderId   — constructs invoice-{orderId} and looks up by id
//   3. leadId    — filters all finances by data.lead_id (most recent first)
//   4. q         — partial case-insensitive match on company name
//
// PII rules enforced:
//   - client_email is NEVER returned
//   - notes is NEVER returned
//   - stripe_invoice_url is NEVER returned
//   - public_token is NEVER returned

type Row = { id: string; data: Record<string, unknown> | null };

type LineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number;
};

type RawLineItem = {
  name?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
  originalUnitPrice?: unknown;
};

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function fetchFinanceById(
  db: ReturnType<typeof getSupabaseAdmin>,
  id: string,
): Promise<Row | null> {
  const { data: rows, error } = await db
    .from("finances")
    .select("id,data")
    .eq("id", id)
    .limit(1);
  if (error && (error as { code?: string }).code !== "42P01") {
    throw new Error(`[ai/invoice-preview] fetch finance ${id}: ${error.message}`);
  }
  if (!rows || rows.length === 0) return null;
  return rows[0] as Row;
}

async function fetchAllFinances(
  db: ReturnType<typeof getSupabaseAdmin>,
): Promise<Row[]> {
  const { data: rows, error } = await db.from("finances").select("id,data");
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/invoice-preview] read finances: ${error.message}`);
  }
  return (rows ?? []) as Row[];
}

async function fetchDepositRequest(
  db: ReturnType<typeof getSupabaseAdmin>,
  depositRequestId: string,
): Promise<Record<string, unknown> | null> {
  const { data: rows, error } = await db
    .from("deposit_requests")
    .select("id,data")
    .eq("id", depositRequestId)
    .limit(1);
  if (error || !rows || rows.length === 0) return null;
  return (rows[0].data ?? {}) as Record<string, unknown>;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtTaxRate(rate: number | null | undefined): string {
  if (rate == null) return "";
  return (rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
}

function normalizeLineItems(src: unknown): LineItem[] {
  if (!Array.isArray(src)) return [];
  return (src as RawLineItem[]).map((li) => ({
    name: String(li.name ?? ""),
    description: String(li.description ?? ""),
    quantity: Number(li.quantity ?? 0),
    unitPrice: Number(li.unitPrice ?? 0),
    lineTotal: Number(li.lineTotal ?? 0),
    ...(li.originalUnitPrice != null
      ? { originalUnitPrice: Number(li.originalUnitPrice) }
      : {}),
  }));
}

// ── Invoice phase derivation ───────────────────────────────────────────────────
// Maps the invoice lifecycle to a simple phase label Jarvis can act on.

function deriveInvoicePhase(raw: Record<string, unknown>): string {
  if (raw.final_paid === true) return "paid_in_full";
  const status = String(raw.status ?? "").toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (status === "draft") return "draft";
  if (raw.deposit_paid === true) return "final_payment_due";
  return "deposit_phase";
}

// ── Email body builder (matches SendFinalInvoiceModal exactly) ─────────────────

function buildEmailBody(
  clientName: string,
  projectName: string,
  balanceRemaining: number,
  publicLink: string | null,
): string {
  const linkLine = publicLink
    ? `View and pay your invoice here:\n${publicLink}`
    : `View and pay your invoice here:\n[INVOICE LINK — generate in HQ first]`;

  return (
    `Hello ${clientName},\n\n` +
    `Your order is complete and the remaining balance is now ready for payment.\n\n` +
    `Remaining Balance:\n${fmtCurrency(balanceRemaining)}\n\n` +
    linkLine + `\n\n` +
    `Please note:\nCard payments include a 3% processing fee.\nBank account payments do not.\n\n` +
    `If you have any questions, please reply to this email.\n\n` +
    TF_PLAIN_CLOSING
  );
}

// ── Preview builder ────────────────────────────────────────────────────────────

async function buildPreview(
  db: ReturnType<typeof getSupabaseAdmin>,
  row: Row,
  selectionNote: string,
): Promise<Response> {
  const raw = (row.data ?? {}) as Record<string, unknown>;

  // Cross-reference deposit_requests for authoritative amounts and line items
  let totalAmount = calcTotal(raw);
  let depositAmount = calcDeposit(raw);
  let lineItems: LineItem[] = normalizeLineItems(raw.line_items);
  let subtotal: number | null = parseAmount(raw.subtotal) > 0 ? parseAmount(raw.subtotal) : null;
  let salesTaxRate: number | null =
    raw.sales_tax_rate != null ? Number(raw.sales_tax_rate) : null;
  let salesTaxAmount: number | null =
    parseAmount(raw.sales_tax_amount) > 0 ? parseAmount(raw.sales_tax_amount) : null;
  let grandTotal: number | null =
    parseAmount(raw.grand_total) > 0 ? parseAmount(raw.grand_total) : null;

  const depositRequestId = (raw.deposit_request_id as string) ?? null;
  if (depositRequestId) {
    const dep = await fetchDepositRequest(db, depositRequestId);
    if (dep) {
      const t = parseAmount(dep.total_amount);
      const d = parseAmount(dep.deposit_amount);
      if (t > 0) totalAmount = t;
      if (d > 0) depositAmount = d;
      if (dep.subtotal != null) subtotal = parseAmount(dep.subtotal);
      if (dep.sales_tax_rate != null) salesTaxRate = Number(dep.sales_tax_rate);
      if (dep.sales_tax_amount != null)
        salesTaxAmount = parseAmount(dep.sales_tax_amount);
      if (dep.grand_total != null) grandTotal = parseAmount(dep.grand_total);
      if (
        Array.isArray(dep.line_items) &&
        (dep.line_items as unknown[]).length > 0
      ) {
        lineItems = normalizeLineItems(dep.line_items);
      }
    }
  }

  const balanceRemaining = Math.max(totalAmount - depositAmount, 0);
  const depositPct =
    totalAmount > 0 ? Math.round((depositAmount / totalAmount) * 100) : 50;

  const invoiceId = row.id;
  const company =
    (raw.client_name as string) || (raw.client as string) || null;
  const orderName =
    (raw.order_name as string) || (raw.orderName as string) || null;
  const orderId = (raw.order_id as string) || null;
  const leadId = (raw.lead_id as string) || null;
  const status = (raw.status as string) || "Draft";
  const depositPaid = raw.deposit_paid === true;
  const depositPaidDate = (raw.deposit_paid_date as string) || null;
  const finalPaid = raw.final_paid === true;
  const finalPaidDate = (raw.final_paid_date as string) || null;
  const finalDueDate =
    (raw.final_due_date as string) || (raw.dueDate as string) || null;
  const publicLink = (raw.public_link as string) || null;
  const invoicePhase = deriveInvoicePhase(raw);

  const clientName = company ?? "there";
  const projectName = orderName ?? "your order";
  const emailSubject = `Final Invoice – ${projectName}`;
  const emailBodyPreview = buildEmailBody(
    clientName,
    projectName,
    balanceRemaining,
    publicLink,
  );

  const verificationSummary = [
    `Invoice ${invoiceId}`,
    company ? ` for ${company}` : "",
    orderName ? ` · ${orderName}` : "",
    ` — status: ${status}, phase: ${invoicePhase}`,
    `, balance: ${fmtCurrency(balanceRemaining)}`,
    publicLink
      ? ". Invoice link active."
      : ". No invoice link yet — generate in HQ.",
  ].join("");

  return okResponse({
    invoiceId,
    invoicePhase,
    company,
    orderName,
    orderId,
    leadId,
    depositRequestId,
    status,
    depositPaid,
    depositPaidDate,
    finalPaid,
    finalPaidDate,
    finalDueDate,
    subtotal,
    salesTaxRate,
    salesTaxRateFormatted: salesTaxRate != null ? fmtTaxRate(salesTaxRate) : null,
    salesTaxAmount:
      salesTaxAmount != null ? Math.round(salesTaxAmount * 100) / 100 : null,
    grandTotal,
    totalAmount: Math.round(totalAmount * 100) / 100,
    depositAmount: Math.round(depositAmount * 100) / 100,
    depositPercent: depositPct,
    balanceRemaining: Math.round(balanceRemaining * 100) / 100,
    lineItems,
    publicLink,
    emailSubject,
    emailBodyPreview,
    verificationSummary,
    selectionNote,
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

/**
 * GET /api/ai/invoice-preview
 *
 * Preview of a final invoice record for Jarvis. Read-only.
 * Lookup by invoiceId, orderId, leadId, or q (partial company name).
 * No records created. No email sent. No token generated.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url = new URL(request.url);
  const invoiceIdParam = url.searchParams.get("invoiceId")?.trim() || null;
  const orderIdParam = url.searchParams.get("orderId")?.trim() || null;
  const leadIdParam = url.searchParams.get("leadId")?.trim() || null;
  const qParam = url.searchParams.get("q")?.trim() || null;

  if (!invoiceIdParam && !orderIdParam && !leadIdParam && !qParam) {
    return errResponse(
      "Provide at least one of: invoiceId, orderId, leadId, or q",
      400,
    );
  }

  try {
    const db = getSupabaseAdmin();

    // ── Path A: invoiceId — direct lookup ──────────────────────────────────────
    if (invoiceIdParam) {
      const row = await fetchFinanceById(db, invoiceIdParam);
      if (!row) {
        return errResponse(
          `No invoice found with id "${invoiceIdParam}". Check the id and try again.`,
          404,
        );
      }
      return buildPreview(db, row, `Invoice ${invoiceIdParam} requested directly.`);
    }

    // ── Path B: orderId — construct invoice-{orderId} ──────────────────────────
    if (orderIdParam) {
      const constructedId = `invoice-${orderIdParam}`;
      const row = await fetchFinanceById(db, constructedId);
      if (!row) {
        return errResponse(
          `No invoice found for order "${orderIdParam}". Invoices are created automatically when a lead reaches Deposit Paid.`,
          404,
        );
      }
      return buildPreview(db, row, `Invoice resolved from orderId ${orderIdParam}.`);
    }

    // Paths C + D require scanning all finance records
    const allFinances = await fetchAllFinances(db);

    // ── Path C: leadId — filter by data.lead_id ────────────────────────────────
    if (leadIdParam) {
      const matches = allFinances.filter(
        (f) => (f.data?.lead_id as string) === leadIdParam,
      );

      if (matches.length === 0) {
        return okResponse({
          leadId: leadIdParam,
          hasInvoice: false,
          message:
            "No invoice found for this lead. Invoices are created automatically when a lead reaches Deposit Paid.",
        });
      }

      const selected = [...matches].sort((a, b) => b.id.localeCompare(a.id))[0];
      const selectionNote =
        matches.length === 1
          ? "Only invoice on file for this lead."
          : `${selected.id} selected (most recent of ${matches.length} for this lead). Use invoiceId=<id> for a specific one.`;

      return buildPreview(db, selected, selectionNote);
    }

    // ── Path D: q — partial company name match ─────────────────────────────────
    const term = (qParam as string).toLowerCase();
    const matchedFinances = allFinances.filter((f) => {
      const company =
        (f.data?.client_name as string) || (f.data?.client as string) || "";
      return company.toLowerCase().includes(term);
    });

    if (matchedFinances.length === 0) {
      return errResponse(
        `No invoice found matching company "${qParam}". Try a different spelling or use invoiceId/orderId/leadId directly.`,
        404,
      );
    }

    // Group by company — if multiple distinct companies match, offer a choice list
    const companiesSet = new Set(
      matchedFinances.map(
        (f) =>
          (f.data?.client_name as string) ||
          (f.data?.client as string) ||
          "Unknown",
      ),
    );

    if (companiesSet.size > 1) {
      return okResponse({
        ambiguous: true,
        matchCount: matchedFinances.length,
        message: `${companiesSet.size} companies match "${qParam}". Which one did you mean?`,
        matches: [...companiesSet].slice(0, 5).map((company) => {
          const inv = matchedFinances.find(
            (f) =>
              ((f.data?.client_name as string) ||
                (f.data?.client as string)) === company,
          );
          return {
            company,
            invoiceId: inv?.id ?? null,
            status: (inv?.data?.status as string) ?? null,
          };
        }),
      });
    }

    // Single company — pick most recent invoice
    const sorted = [...matchedFinances].sort((a, b) => b.id.localeCompare(a.id));
    const selected = sorted[0];
    const selectionNote =
      sorted.length === 1
        ? "Only invoice on file for this company."
        : `${selected.id} selected (most recent of ${sorted.length} invoices). Use invoiceId=<id> for a specific one.`;

    return buildPreview(db, selected, selectionNote);
  } catch (err) {
    console.error("[ai/invoice-preview GET]", err);
    return errResponse("Internal server error", 500);
  }
}
