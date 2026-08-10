import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { readField, stringField, statusText } from "@/lib/recordUtils";
import { orderEstDeliveryDate } from "@/lib/estDelivery";
import { normalizeCRMStage } from "@/lib/dashboardMetrics";
import { parseAmount, calcBalance, calcTotal } from "@/lib/invoiceCalc";
import { INACTIVE_FINANCE_STATUSES } from "@/lib/constants";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type Row = DashboardRecord;
type TableRow = { id: string; data: Row | null };

// ── Fetcher ───────────────────────────────────────────────────────────────────

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
    throw new Error(`[ai/client-intelligence] read ${table}: ${error.message}`);
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

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function quoteEffectiveTs(q: Row): string {
  return (
    (q.acknowledgementAcceptedAt as string) ||
    (q.sent_date as string) ||
    (q.created_at as string) ||
    ""
  );
}

// ── Output types ──────────────────────────────────────────────────────────────

type QuoteSnapshot = {
  quoteId: string;
  quoteNumber: string | null;
  status: string;
  grandTotal: number | null;
  expirationDate: string | null;
  sentDate: string | null;
  daysUntilExpiry: number | null;
};

type InvoiceSnapshot = {
  invoiceId: string;
  orderName: string;
  status: string;
  depositPaid: boolean;
  finalPaid: boolean;
  balance: number;
  dueDate: string | null;
};

type DepositSnapshot = {
  depositId: string;
  depositRequestNumber: string | null;
  status: string;
  depositAmount: number | null;
  sentDate: string | null;
};

type OrderSnapshot = {
  orderId: string;
  orderName: string;
  status: string;
  estimatedDeliveryDate: string | null;
};

type ActivityEntry = {
  date: string;
  type: string;
  owner: string;
};

type ClientIntelligence = {
  leadId: string;
  company: string;
  stage: string;
  status: string;
  owner: string | null;
  followUpDate: string | null;
  lastContacted: string | null;
  nextRecommendedFollowUp: string;
  recentQuotes: QuoteSnapshot[];
  recentInvoices: InvoiceSnapshot[];
  recentDeposits: DepositSnapshot[];
  recentOrders: OrderSnapshot[];
  recentActivityLogs: ActivityEntry[];
  summary: string;
};

type AmbiguousResult = {
  ambiguous: true;
  matchCount: number;
  matches: { leadId: string; company: string; stage: string; status: string }[];
};

// ── nextRecommendedFollowUp ───────────────────────────────────────────────────

function computeNextFollowUp(
  lead: Row,
  quotesForLead: Row[],
  todayISO: string,
): string {
  const stage      = normalizeCRMStage(stringField(lead, "stage"));
  const followUp   = readField(lead, "followUpDate", "follow_up_date");
  const hasFollowUp = typeof followUp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(followUp);

  // Quote Sent — check expiry first (actionable)
  if (stage === "Quote Sent" && quotesForLead.length > 0) {
    const sorted = [...quotesForLead].sort((a, b) => quoteEffectiveTs(b).localeCompare(quoteEffectiveTs(a)));
    const latest = sorted[0];
    const expiry = stringField(latest, "expiration_date");
    if (expiry) {
      const daysLeft = daysBetween(todayISO, expiry);
      if (daysLeft < 0)  return `Quote expired ${plural(-daysLeft, "day")} ago — revise and resend`;
      if (daysLeft <= 3) return `Quote expires in ${plural(daysLeft, "day")} — follow up now`;
    }
  }

  // Stage-gated recommendations before follow-up date check
  if (stage === "Quote Approved" && !hasFollowUp) {
    return "Quote approved — send deposit request to client";
  }
  if (stage === "Design Approved" && !hasFollowUp) {
    return "Design approved — generate and send quote";
  }

  // Follow-up date
  if (hasFollowUp) {
    const daysUntil = daysBetween(todayISO, followUp);
    if (daysUntil < 0)  return `Follow-up overdue — was due ${followUp} (${plural(-daysUntil, "day")} ago)`;
    if (daysUntil === 0) return `Follow-up due today`;
    if (daysUntil === 1) return `Follow-up due tomorrow (${followUp})`;
    return `Follow-up scheduled for ${followUp} (in ${plural(daysUntil, "day")})`;
  }

  // Stage fallbacks
  if (stage === "Deposit Paid")    return "Deposit paid — verify production order is underway";
  if (stage === "New Lead" || stage === "Contacted") return "Early stage lead — schedule a discovery call";

  return "No follow-up scheduled";
}

// ── Main intelligence computation ─────────────────────────────────────────────

function buildIntelligence(
  lead: Row,
  quotes: Row[],
  deposits: Row[],
  invoices: Row[],
  orders: Row[],
  todayISO: string,
): ClientIntelligence {
  const leadId  = lead.id;
  const company = stringField(lead, "company") || stringField(lead, "name") || "Unknown";
  const stage   = normalizeCRMStage(stringField(lead, "stage"));
  const status  = stringField(lead, "status") || "Open";
  const owner   = stringField(lead, "owner") || null;
  const followUpDate = readField(lead, "followUpDate", "follow_up_date") || null;
  const typedFollowUp = typeof followUpDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(followUpDate)
    ? followUpDate : null;

  // ── Quotes ────────────────────────────────────────────────────────────────
  const quotesForLead = quotes.filter((q) => stringField(q, "lead_id") === leadId);
  const sortedQuotes  = [...quotesForLead].sort((a, b) =>
    quoteEffectiveTs(b).localeCompare(quoteEffectiveTs(a)),
  );
  const recentQuotes: QuoteSnapshot[] = sortedQuotes.slice(0, 5).map((q) => {
    const expiry = stringField(q, "expiration_date") || null;
    return {
      quoteId:         q.id,
      quoteNumber:     stringField(q, "quote_number") || null,
      status:          stringField(q, "status") || "draft",
      grandTotal:      parseAmount(q.grand_total ?? q.total_amount ?? 0) || null,
      expirationDate:  expiry,
      sentDate:        stringField(q, "sent_date") || null,
      daysUntilExpiry: expiry ? daysBetween(todayISO, expiry) : null,
    };
  });

  // ── Deposits ──────────────────────────────────────────────────────────────
  const depositsForLead = deposits.filter((d) => stringField(d, "lead_id") === leadId);
  const sortedDeposits  = [...depositsForLead].sort((a, b) =>
    (stringField(b, "sent_date") || b.id as string).localeCompare(
      stringField(a, "sent_date") || a.id as string,
    ),
  );
  const recentDeposits: DepositSnapshot[] = sortedDeposits.slice(0, 5).map((d) => ({
    depositId:            d.id,
    depositRequestNumber: stringField(d, "deposit_request_number") || null,
    status:               stringField(d, "status") || "draft",
    depositAmount:        parseAmount(d.deposit_amount ?? 0) || null,
    sentDate:             stringField(d, "sent_date") || null,
  }));

  // ── Invoices ──────────────────────────────────────────────────────────────
  const invoicesForLead = invoices.filter(
    (inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)) && stringField(inv, "lead_id") === leadId,
  );
  const recentInvoices: InvoiceSnapshot[] = invoicesForLead.slice(0, 5).map((inv) => {
    const dueDate = stringField(inv, "final_due_date") || stringField(inv, "dueDate") || null;
    const balance = inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv);
    return {
      invoiceId:   inv.id,
      orderName:   stringField(inv, "orderName") || stringField(inv, "order_name") || "Invoice",
      status:      stringField(inv, "status") || "Unknown",
      depositPaid: inv.deposit_paid === true,
      finalPaid:   inv.final_paid === true,
      balance:     Math.round((inv.final_paid === true ? 0 : balance) * 100) / 100,
      dueDate,
    };
  });

  // ── Orders (via invoice.order_id) ─────────────────────────────────────────
  const orderById = new Map<string, Row>();
  for (const o of orders) orderById.set(o.id, o);

  const linkedOrderIds = new Set<string>();
  for (const inv of invoicesForLead) {
    const oid = stringField(inv, "order_id");
    if (oid) linkedOrderIds.add(oid);
  }
  const recentOrders: OrderSnapshot[] = [...linkedOrderIds]
    .map((oid) => orderById.get(oid))
    .filter((o): o is Row => o !== undefined)
    .slice(0, 5)
    .map((o) => ({
      orderId:   o.id,
      orderName: stringField(o, "orderName") || stringField(o, "order_name") || "Order",
      status:    stringField(o, "status") || "Unknown",
      estimatedDeliveryDate:
        orderEstDeliveryDate(o) ||
        stringField(o, "dueDate") ||
        stringField(o, "final_due_date") ||
        null,
    }));

  // ── Activity logs from communicationHistory (safe fields only) ────────────
  const rawHistory = lead.communicationHistory;
  const activityEntries: ActivityEntry[] = [];
  if (Array.isArray(rawHistory)) {
    for (const entry of rawHistory) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const date  = stringField(e, "date");
      const type  = stringField(e, "type") || "Contact";
      const owner = stringField(e, "owner") || "";
      if (date) activityEntries.push({ date, type, owner });
      // summary/notes intentionally excluded
    }
  }
  // Most recent first, cap at 10
  activityEntries.sort((a, b) => b.date.localeCompare(a.date));
  const recentActivityLogs = activityEntries.slice(0, 10);

  // ── lastContacted ─────────────────────────────────────────────────────────
  const lastContacted = recentActivityLogs[0]?.date ?? null;

  // ── nextRecommendedFollowUp ───────────────────────────────────────────────
  const nextRecommendedFollowUp = computeNextFollowUp(lead, quotesForLead, todayISO);

  // ── summary ───────────────────────────────────────────────────────────────
  const quoteCount   = recentQuotes.length;
  const invoiceCount = recentInvoices.length;
  const orderCount   = recentOrders.length;
  const contactStr   = lastContacted ? `, last contacted ${lastContacted}` : "";
  const partsStr     = [
    quoteCount  > 0 ? `${quoteCount} quote${quoteCount > 1 ? "s" : ""}` : "",
    invoiceCount > 0 ? `${invoiceCount} invoice${invoiceCount > 1 ? "s" : ""}` : "",
    orderCount  > 0 ? `${orderCount} order${orderCount > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(", ");

  const summary = `${company} — ${stage}${contactStr}. ${partsStr ? `Connected records: ${partsStr}. ` : ""}Next: ${nextRecommendedFollowUp}`;

  return {
    leadId,
    company,
    stage,
    status,
    owner,
    followUpDate: typedFollowUp,
    lastContacted,
    nextRecommendedFollowUp,
    recentQuotes,
    recentInvoices,
    recentDeposits,
    recentOrders,
    recentActivityLogs,
    summary,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/ai/client-intelligence
 *
 * Returns a full activity and pipeline view for one CRM lead:
 * recentQuotes, recentInvoices, recentDeposits, recentOrders,
 * recentActivityLogs (type/date/owner — no note content),
 * lastContacted, nextRecommendedFollowUp, and a plain-language summary.
 * Lookup by leadId (direct) or q (partial company name search).
 * Ambiguous q returns a choice list. Read-only.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url    = new URL(request.url);
  const leadId = url.searchParams.get("leadId")?.trim() ?? "";
  const q      = url.searchParams.get("q")?.trim() ?? "";

  if (!leadId && !q) return errResponse("Provide leadId or q", 400);

  try {
    const db = getSupabaseAdmin();
    const [leads, quotes, deposits, invoices, orders] = await Promise.all([
      fetchTable(db, "crm_leads"),
      fetchTable(db, "quotes"),
      fetchTable(db, "deposit_requests"),
      fetchTable(db, "finances"),
      fetchTable(db, "orders"),
    ]);

    const todayISO = new Date().toISOString().slice(0, 10);

    // ── Find lead(s) ──────────────────────────────────────────────────────────
    let candidates: Row[] = [];

    if (leadId) {
      const found = leads.find((l) => l.id === leadId);
      if (!found) return errResponse("Lead not found", 404);
      candidates = [found];
    } else {
      const term = q.toLowerCase();
      candidates = leads.filter((l) => {
        const name = (stringField(l, "company") || stringField(l, "name")).toLowerCase();
        return name.includes(term);
      });
      if (candidates.length === 0) return errResponse("No matching lead found", 404);
    }

    // ── Ambiguous ─────────────────────────────────────────────────────────────
    if (candidates.length > 1) {
      const matches = candidates.slice(0, 5).map((l) => ({
        leadId:  l.id,
        company: stringField(l, "company") || stringField(l, "name") || "Unknown",
        stage:   normalizeCRMStage(stringField(l, "stage")),
        status:  stringField(l, "status") || "Open",
      }));
      const result: AmbiguousResult = {
        ambiguous:  true,
        matchCount: candidates.length,
        matches,
      };
      return okResponse(result);
    }

    // ── Single result ─────────────────────────────────────────────────────────
    const lead   = candidates[0];
    const result = buildIntelligence(lead, quotes, deposits, invoices, orders, todayISO);
    return okResponse(result);
  } catch (err) {
    console.error("[ai/client-intelligence]", err);
    return errResponse("Internal server error", 500);
  }
}
