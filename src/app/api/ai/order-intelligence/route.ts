import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { stringField, statusText } from "@/lib/recordUtils";
import { normalizeCRMStage } from "@/lib/dashboardMetrics";
import { parseAmount, calcBalance, calcTotal } from "@/lib/invoiceCalc";
import { INACTIVE_ORDER_STATUSES, INACTIVE_FINANCE_STATUSES } from "@/lib/constants";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type Row = DashboardRecord;
type TableRow = { id: string; data: Row | null };

// ── Table fetcher ─────────────────────────────────────────────────────────────

async function fetchTable(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<Row[]> {
  const { data: rows, error } = await db
    .from(table)
    .select("id,data")
    .order("id", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/order-intelligence] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is Row => Boolean(item?.id));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T12:00:00");
  const b = new Date(toISO + "T12:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtAmount(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function maxDate(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d));
  if (valid.length === 0) return null;
  return valid.sort().pop() ?? null;
}

// ── Quote recency sort (same as quote-preview and pendingQuotes) ──────────────

function quoteEffectiveTs(q: Row): string {
  return (
    (q.acknowledgementAcceptedAt as string) ||
    (q.sent_date as string) ||
    (q.created_at as string) ||
    ""
  );
}

function mostRecentQuote(quotes: Row[], leadId: string): Row | null {
  const forLead = quotes.filter((q) => stringField(q, "lead_id") === leadId);
  if (forLead.length === 0) return null;
  return [...forLead].sort((a, b) => {
    const ta = quoteEffectiveTs(a);
    const tb = quoteEffectiveTs(b);
    if (tb > ta) return 1;
    if (tb < ta) return -1;
    return (b.id as string) > (a.id as string) ? 1 : -1;
  })[0];
}

function mostRecentDeposit(deposits: Row[], leadId: string): Row | null {
  const forLead = deposits.filter((d) => stringField(d, "lead_id") === leadId);
  if (forLead.length === 0) return null;
  return [...forLead].sort((a, b) =>
    (stringField(b, "sent_date") || b.id as string).localeCompare(
      stringField(a, "sent_date") || a.id as string,
    ),
  )[0];
}

// ── Intelligence types ────────────────────────────────────────────────────────

type QuoteStatus   = "none" | "draft" | "sent" | "expired" | "approved";
type DepositStatus = "none" | "draft" | "pending" | "payment_failed" | "paid";
type InvoiceStatus = "none" | "outstanding" | "deposit_paid" | "overdue" | "paid";

type OrderIntelligence = {
  orderId: string;
  orderName: string;
  company: string | null;
  leadId: string | null;
  currentStage: string;
  quoteStatus: QuoteStatus;
  depositStatus: DepositStatus;
  productionStatus: string;
  invoiceStatus: InvoiceStatus;
  nextStep: string;
  blockerReason: string | null;
  lastUpdated: string | null;
  summary: string;
};

type AmbiguousResult = {
  ambiguous: true;
  matchCount: number;
  matches: { orderId: string; orderName: string; status: string; company: string | null }[];
};

// ── Intelligence computation ──────────────────────────────────────────────────

function computeIntelligence(
  order: Row,
  invoice: Row | null,
  lead: Row | null,
  quote: Row | null,
  deposit: Row | null,
  todayISO: string,
): OrderIntelligence {
  const orderId    = order.id;
  const orderName  = stringField(order, "orderName") || stringField(order, "order_name") || "Order";
  const leadId     = lead?.id ?? null;
  const company    = lead ? (stringField(lead, "company") || stringField(lead, "name") || null) : null;
  const orderStatus = stringField(order, "status") || "Unknown";
  const isOrderActive = !INACTIVE_ORDER_STATUSES.has(statusText(order));

  // Delivery date
  const dueDate =
    stringField(order, "estimatedDeliveryDate") ||
    stringField(order, "dueDate") ||
    stringField(order, "final_due_date") ||
    null;

  const vendor = stringField(order, "vendor") || stringField(order, "vendor_name") || null;

  // ── quoteStatus ─────────────────────────────────────────────────────────────
  let quoteStatus: QuoteStatus = "none";
  if (lead && stringField(lead, "approved_quote_id")) {
    quoteStatus = "approved";
  } else if (quote) {
    const qStatus = stringField(quote, "status") || "draft";
    const expiry  = stringField(quote, "expiration_date");
    if (qStatus === "approved") {
      quoteStatus = "approved";
    } else if (expiry && expiry < todayISO) {
      quoteStatus = "expired";
    } else if (qStatus === "sent") {
      quoteStatus = "sent";
    } else {
      quoteStatus = "draft";
    }
  }

  // ── depositStatus ────────────────────────────────────────────────────────────
  let depositStatus: DepositStatus = "none";
  if (invoice?.deposit_paid === true) {
    depositStatus = "paid";
  } else if (deposit) {
    const ds = stringField(deposit, "status");
    if (ds === "paid")           depositStatus = "paid";
    else if (ds === "pending")   depositStatus = "pending";
    else if (ds === "payment_failed") depositStatus = "payment_failed";
    else                         depositStatus = "draft";
  }

  // ── productionStatus ─────────────────────────────────────────────────────────
  const productionStatus = orderStatus;

  // ── invoiceStatus ────────────────────────────────────────────────────────────
  let invoiceStatus: InvoiceStatus = "none";
  if (invoice) {
    if (invoice.final_paid === true) {
      invoiceStatus = "paid";
    } else if (INACTIVE_FINANCE_STATUSES.has(statusText(invoice))) {
      invoiceStatus = "none";
    } else {
      const invDue = stringField(invoice, "final_due_date") || stringField(invoice, "dueDate");
      if (invDue && invDue < todayISO) {
        invoiceStatus = "overdue";
      } else if (invoice.deposit_paid === true) {
        invoiceStatus = "deposit_paid";
      } else {
        invoiceStatus = "outstanding";
      }
    }
  }

  // ── currentStage ─────────────────────────────────────────────────────────────
  let currentStage: string;
  if (lead) {
    currentStage = normalizeCRMStage(stringField(lead, "stage"));
  } else if (invoiceStatus === "paid") {
    currentStage = "Complete";
  } else if (orderStatus.toLowerCase() === "delivered") {
    currentStage = "Delivered";
  } else if (!isOrderActive) {
    currentStage = orderStatus;
  } else {
    currentStage = `In Production (${orderStatus})`;
  }

  // ── lastUpdated ───────────────────────────────────────────────────────────────
  const lastUpdated = maxDate(
    invoice?.final_paid_date as string,
    invoice?.deposit_paid_date as string,
    quote ? quoteEffectiveTs(quote) : null,
    deposit ? stringField(deposit, "sent_date") : null,
  );

  // ── nextStep and blockerReason ───────────────────────────────────────────────
  let nextStep    = "No further action identified.";
  let blockerReason: string | null = null;

  const orderDaysLate  = dueDate && isOrderActive ? daysBetween(dueDate, todayISO) : 0;
  const depositDays    = deposit ? daysBetween(stringField(deposit, "sent_date") || todayISO, todayISO) : 0;
  const invDueDate     = invoice ? (stringField(invoice, "final_due_date") || stringField(invoice, "dueDate") || null) : null;
  const invoiceDaysLate = invDueDate && invoiceStatus === "overdue" ? daysBetween(invDueDate, todayISO) : 0;

  const balance = invoice && invoiceStatus !== "paid"
    ? Math.round((invoice.deposit_paid === true ? calcBalance(invoice) : calcTotal(invoice)) * 100) / 100
    : 0;

  // Payment failed — critical blocker
  if (depositStatus === "payment_failed") {
    nextStep      = "Client payment failed — contact client to retry or collect payment directly";
    blockerReason = "Deposit payment failed. Production cannot start until payment is resolved";
  }
  // Invoice overdue
  else if (invoiceStatus === "overdue") {
    nextStep      = `Collect overdue final payment — ${fmtAmount(balance)} outstanding, ${plural(invoiceDaysLate, "day")} past due`;
    blockerReason = `Final invoice ${plural(invoiceDaysLate, "day")} past due — ${fmtAmount(balance)} uncollected`;
  }
  // Order past delivery date
  else if (dueDate && orderDaysLate > 0 && isOrderActive && orderStatus.toLowerCase() !== "delivered") {
    const vendorNote = vendor ? ` — follow up with ${vendor}` : "";
    nextStep      = `Order is ${plural(orderDaysLate, "day")} past estimated delivery (${dueDate})${vendorNote}`;
    blockerReason = `Order overdue by ${plural(orderDaysLate, "day")}. Delivery was expected ${dueDate}`;
  }
  // Order ready for delivery
  else if (orderStatus.toLowerCase() === "ready") {
    nextStep = `Order is ready — notify client and arrange delivery`;
  }
  // Invoice outstanding, order delivered
  else if (orderStatus.toLowerCase() === "delivered" && invoiceStatus !== "paid" && balance > 0) {
    nextStep = `Collect final payment — ${fmtAmount(balance)} remaining`;
  }
  // Quality check
  else if (orderStatus.toLowerCase() === "quality check") {
    nextStep = `Quality review in progress — approve before scheduling delivery`;
  }
  // In production
  else if (orderStatus.toLowerCase() === "production") {
    const eta = dueDate ? ` — estimated delivery ${dueDate}` : "";
    const vendorNote = vendor ? ` with ${vendor}` : "";
    nextStep = `Order in production${vendorNote}${eta}`;
  }
  // All paid — done
  else if (invoiceStatus === "paid") {
    nextStep = `Order complete and fully paid`;
  }
  // Deposit outstanding — sent a while ago
  else if (depositStatus === "pending" && depositDays >= 7) {
    nextStep      = `Follow up on deposit — sent ${plural(depositDays, "day")} ago with no payment`;
    blockerReason = `Deposit request unpaid after ${plural(depositDays, "day")} — follow up needed before production can start`;
  }
  // Deposit pending
  else if (depositStatus === "pending") {
    const expiry = quote ? stringField(quote, "expiration_date") : null;
    nextStep = `Waiting for client to pay deposit${expiry ? ` (quote expires ${expiry})` : ""}`;
  }
  // Quote expired
  else if (quoteStatus === "expired") {
    const expiry = quote ? stringField(quote, "expiration_date") : null;
    const daysExpired = expiry ? daysBetween(expiry, todayISO) : 0;
    nextStep      = `Quote expired ${plural(daysExpired, "day")} ago — revise and resend`;
    blockerReason = `Quote expired ${expiry ? `on ${expiry}` : ""} — client cannot approve. Resend required`;
  }
  // Quote approved, no deposit yet
  else if (quoteStatus === "approved" && depositStatus === "none") {
    nextStep = `Quote approved — generate and send deposit request to client`;
  }
  // Waiting for quote approval
  else if (quoteStatus === "sent") {
    const expiry = quote ? stringField(quote, "expiration_date") : null;
    const expiryNote = expiry ? ` (expires ${expiry})` : "";
    nextStep = `Waiting for client to approve quote${expiryNote}`;
  }
  // Design approved, quote needed
  else if (currentStage === "Design Approved" && quoteStatus === "none") {
    nextStep = `Design approved — generate and send quote to client`;
  }
  // Client review
  else if (currentStage === "Client Review") {
    nextStep = `Awaiting client feedback on design`;
  }
  // Design phase
  else if (currentStage === "Design Phase") {
    nextStep = `Complete design work and prepare quote`;
  }
  // Early pipeline
  else if (currentStage === "Contacted" || currentStage === "New Lead") {
    nextStep = `Qualify and schedule discovery call with prospect`;
  }
  // Deposit paid, no order yet
  else if (currentStage === "Deposit Paid" && !isOrderActive) {
    nextStep = `Deposit received — create production order`;
  }
  // No deposit request, quote approved
  else if (quoteStatus === "approved" || currentStage === "Quote Approved") {
    nextStep = `Send deposit request to client`;
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  const companyStr = company ? ` for ${company}` : "";
  const stageStr   = currentStage !== "Unknown" ? ` (${currentStage})` : "";
  const summary    = `${orderName}${companyStr}${stageStr}: ${nextStep}${blockerReason ? " BLOCKER: " + blockerReason : ""}`;

  return {
    orderId,
    orderName,
    company,
    leadId,
    currentStage,
    quoteStatus,
    depositStatus,
    productionStatus,
    invoiceStatus,
    nextStep,
    blockerReason,
    lastUpdated,
    summary,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/ai/order-intelligence
 *
 * Returns a unified operational view for one order — stage, quote/deposit/
 * production/invoice status, nextStep, blockerReason, and a plain-language
 * summary. Read-only. No PII returned.
 *
 * Query params (at least one required):
 *   q        — partial, case-insensitive order name search (e.g. "DSF7")
 *   orderId  — direct order UUID
 *   leadId   — CRM lead UUID (finds the order linked via invoice.lead_id)
 *
 * When q matches multiple orders, returns { ambiguous: true, matches: [...] }.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url     = new URL(request.url);
  const q       = url.searchParams.get("q")?.trim() ?? "";
  const orderId = url.searchParams.get("orderId")?.trim() ?? "";
  const leadId  = url.searchParams.get("leadId")?.trim() ?? "";

  if (!q && !orderId && !leadId) {
    return errResponse("Provide q, orderId, or leadId", 400);
  }

  try {
    const db = getSupabaseAdmin();
    const [orders, invoices, leads, quotes, deposits] = await Promise.all([
      fetchTable(db, "orders"),
      fetchTable(db, "finances"),
      fetchTable(db, "crm_leads"),
      fetchTable(db, "quotes"),
      fetchTable(db, "deposit_requests"),
    ]);

    const todayISO = new Date().toISOString().slice(0, 10);

    // ── Build lookup maps ─────────────────────────────────────────────────────
    // invoice → order (by invoice.order_id)
    // invoice → lead  (by invoice.lead_id)
    const invoiceByOrderId = new Map<string, Row>();
    for (const inv of invoices) {
      const oid = stringField(inv, "order_id");
      if (oid && !invoiceByOrderId.has(oid)) invoiceByOrderId.set(oid, inv);
    }

    const invoiceByLeadId = new Map<string, Row>();
    for (const inv of invoices) {
      const lid = stringField(inv, "lead_id");
      if (lid && !invoiceByLeadId.has(lid)) invoiceByLeadId.set(lid, inv);
    }

    const leadById = new Map<string, Row>();
    for (const l of leads) leadById.set(l.id, l);

    // ── Find the target order(s) ──────────────────────────────────────────────
    let candidates: Row[] = [];

    if (orderId) {
      const found = orders.find((o) => o.id === orderId);
      if (!found) return errResponse("Order not found", 404);
      candidates = [found];
    } else if (leadId) {
      // Find order via invoice linked to this lead
      const inv = invoiceByLeadId.get(leadId);
      if (!inv) return errResponse("No order found for this lead", 404);
      const oid = stringField(inv, "order_id");
      const found = oid ? orders.find((o) => o.id === oid) : null;
      if (!found) return errResponse("No order found for this lead", 404);
      candidates = [found];
    } else {
      // Search by order name (case-insensitive partial match)
      const term = q.toLowerCase();
      candidates = orders.filter((o) => {
        const name = (stringField(o, "orderName") || stringField(o, "order_name")).toLowerCase();
        return name.includes(term);
      });
      if (candidates.length === 0) return errResponse("No matching order found", 404);
    }

    // ── Handle ambiguous results ──────────────────────────────────────────────
    if (candidates.length > 1) {
      const matches = candidates.slice(0, 5).map((o) => {
        const inv    = invoiceByOrderId.get(o.id);
        const lid    = inv ? stringField(inv, "lead_id") : (stringField(o, "lead_id") || "");
        const lead   = lid ? leadById.get(lid) ?? null : null;
        const company = lead ? (stringField(lead, "company") || stringField(lead, "name") || null) : null;
        return {
          orderId:   o.id,
          orderName: stringField(o, "orderName") || stringField(o, "order_name") || "Order",
          status:    stringField(o, "status") || "Unknown",
          company,
        };
      });
      const result: AmbiguousResult = {
        ambiguous:  true,
        matchCount: candidates.length,
        matches,
      };
      return okResponse(result);
    }

    // ── Single result — compute full intelligence ──────────────────────────────
    const order   = candidates[0];
    const invoice = invoiceByOrderId.get(order.id) ?? null;

    // Resolve lead: invoice.lead_id → lead, fallback to order.lead_id
    const invoiceLid = invoice ? stringField(invoice, "lead_id") : "";
    const orderLid   = stringField(order, "lead_id") || stringField(order, "crm_lead_id");
    const resolvedLid = invoiceLid || orderLid || "";
    const lead        = resolvedLid ? (leadById.get(resolvedLid) ?? null) : null;

    const quote   = lead ? mostRecentQuote(quotes, lead.id) : null;
    const deposit = lead ? mostRecentDeposit(deposits, lead.id) : null;

    const result = computeIntelligence(order, invoice, lead, quote, deposit, todayISO);
    return okResponse(result);
  } catch (err) {
    console.error("[ai/order-intelligence]", err);
    return errResponse("Internal server error", 500);
  }
}
