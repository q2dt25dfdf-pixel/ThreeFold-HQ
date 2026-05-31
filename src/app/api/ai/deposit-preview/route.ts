import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";

export const dynamic = "force-dynamic";

// ── GET /api/ai/deposit-preview ────────────────────────────────────────────────
//
// Read-only preview of the most recent deposit request for a CRM lead.
// CRITICAL: Never calls POST /api/deposit/generate — that creates a real deposit
// record with a sequential number on every invocation.
// This endpoint only reads what already exists.
//
// Resolution priority:
//   1. leadId        — direct UUID lookup (resolves via deposit_requests.lead_id)
//   2. depositNumber — find and return that exact deposit (bypasses recency sort)
//   3. q             — partial case-insensitive match on lead company name
//
// "Most recent" deposit selection (all paths except depositNumber):
//   Sort: sent_date DESC → created_at DESC → id DESC
//
// PII rules enforced:
//   - client_name is NEVER returned — company resolved via lead_id → crm_leads.company
//   - client_email is NEVER returned
//   - notes is NEVER returned
//   - payment_instructions is NEVER returned (may contain Venmo/Zelle/bank details)
//   - public_token is NEVER returned

type Row = { id: string; data: Record<string, unknown> | null };

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function fetchTable(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<Row[]> {
  const { data: rows, error } = await db.from(table).select("id,data");
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/deposit-preview] read ${table}: ${error.message}`);
  }
  return (rows ?? []) as Row[];
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

// ── Deposit recency sort ───────────────────────────────────────────────────────

function effectiveTs(d: Row): string {
  const data = d.data ?? {};
  return (data.sent_date as string) || (data.created_at as string) || d.id;
}

function sortByRecency(deposits: Row[]): Row[] {
  return [...deposits].sort((a, b) => {
    const ta = effectiveTs(a);
    const tb = effectiveTs(b);
    if (tb > ta) return 1;
    if (tb < ta) return -1;
    return b.id > a.id ? 1 : -1;
  });
}

// ── Email template (matches HQ SendDepositModal exactly) ──────────────────────

type LineItem = { name: string; quantity: number; [key: string]: unknown };

function buildEmailBody(
  contactName: string,
  depositNumber: string | null,
  totalAmount: number,
  depositAmount: number,
  balanceRemaining: number,
  lineItems: LineItem[] | null,
  subtotal: number | null,
  salesTaxRate: number | null,
  salesTaxAmount: number | null,
  publicLink: string | null,
): string {
  const depositPercent = totalAmount > 0
    ? Math.round((depositAmount / totalAmount) * 100)
    : 50;

  const itemSummary = lineItems && lineItems.length > 0
    ? `\n\nItems included:\n${lineItems.map((i) => `• ${i.name} (×${i.quantity})`).join("\n")}`
    : "";

  const hasTax = salesTaxAmount != null && salesTaxAmount > 0;
  const taxLine = hasTax
    ? `\nSales Tax (${fmtTaxRate(salesTaxRate)}): ${fmtCurrency(salesTaxAmount!)}`
    : "";
  const subtotalLine = subtotal != null && subtotal !== totalAmount
    ? `\nSubtotal: ${fmtCurrency(subtotal)}${taxLine}`
    : "";

  return (
    `Hi ${contactName},\n\n` +
    `Your project with Threefold Supply Co. is approved and ready to move into production!\n\n` +
    `To kick things off, we require a deposit as shown below.${itemSummary}\n\n` +
    `Deposit Request #: ${depositNumber ?? "[DEPOSIT NUMBER]"}${subtotalLine}\n` +
    `Total Project Value: ${fmtCurrency(totalAmount)}\n` +
    `Deposit Due (${depositPercent}%): ${fmtCurrency(depositAmount)}\n` +
    `Balance Due on Completion: ${fmtCurrency(balanceRemaining)}\n\n` +
    `Please note: Card payments include a 3% processing fee. Bank account payments do not.\n\n` +
    `View your full deposit request here:\n${publicLink ?? "[DEPOSIT LINK]"}\n\n` +
    `Once your deposit is received, we'll get started right away. Questions? Just reply to this email.\n\n` +
    `Best,`
  );
}

// ── Preview builder ────────────────────────────────────────────────────────────

function buildPreview(
  deposit: Row,
  leadId: string,
  company: string | null,
  totalDepositsForLead: number,
  selectionNote: string,
): Response {
  const d = (deposit.data ?? {}) as Record<string, unknown>;

  const depositId      = deposit.id;
  const depositNumber  = (d.deposit_request_number as string) ?? null;
  const status         = (d.status as string) ?? "draft";
  const sentDate       = (d.sent_date as string) ?? null;
  const depositAmount  = (d.deposit_amount as number) ?? 0;
  const totalAmount    = (d.total_amount as number) ?? 0;
  const grandTotal     = (d.grand_total as number | null) ?? null;
  const balanceRemaining = (d.balance_remaining as number) ??
    Math.max(totalAmount - depositAmount, 0);
  const lineItems      = (d.line_items as LineItem[] | null) ?? null;
  const subtotal       = (d.subtotal as number | null) ?? null;
  const salesTaxRate   = (d.sales_tax_rate as number | null) ?? null;
  const salesTaxAmount = (d.sales_tax_amount as number | null) ?? null;
  const publicLink     = (d.public_link as string | null) ?? null;

  const contactName = company ?? "there";
  const emailSubject = depositNumber
    ? `Your Deposit Request — ${depositNumber} | Threefold Supply Co.`
    : "Your Deposit Request | Threefold Supply Co.";

  const emailBodyPreview = buildEmailBody(
    contactName, depositNumber, totalAmount, depositAmount, balanceRemaining,
    lineItems, subtotal, salesTaxRate, salesTaxAmount, publicLink,
  );

  const depositPct = totalAmount > 0
    ? Math.round((depositAmount / totalAmount) * 100)
    : 50;

  const verificationSummary = [
    `Deposit request ${depositNumber ?? depositId}`,
    ` for ${fmtCurrency(depositAmount)} (${depositPct}% of ${fmtCurrency(totalAmount)} project)`,
    ` — status: ${status}`,
    sentDate ? `, sent ${sentDate}` : ", not yet sent",
    publicLink ? ". Public link active." : ". No public link yet.",
  ].join("");

  return okResponse({
    leadId,
    company,
    depositId,
    depositNumber,
    depositAmount,
    totalAmount,
    grandTotal,
    balanceRemaining,
    status,
    sentDate,
    lineItems,
    subtotal,
    salesTaxRate,
    salesTaxAmount,
    publicLink,
    emailSubject,
    emailBodyPreview,
    verificationSummary,
    totalDepositsForLead,
    selectionNote,
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

/**
 * GET /api/ai/deposit-preview
 *
 * Preview of the most recent deposit request for a CRM lead.
 * Lookup by leadId, depositNumber, or q (partial company name).
 * Ambiguous q returns a choice list. No records created. Read-only.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url = new URL(request.url);
  const leadIdParam     = url.searchParams.get("leadId")?.trim()        || null;
  const depositNumParam = url.searchParams.get("depositNumber")?.trim() || null;
  const qParam          = url.searchParams.get("q")?.trim()             || null;

  if (!leadIdParam && !depositNumParam && !qParam) {
    return errResponse("Provide at least one of: leadId, depositNumber, or q", 400);
  }

  try {
    const db = getSupabaseAdmin();
    const [deposits, leads] = await Promise.all([
      fetchTable(db, "deposit_requests"),
      fetchTable(db, "crm_leads"),
    ]);

    // Build lead lookup map
    const leadById = new Map<string, Record<string, unknown>>();
    for (const l of leads) {
      if (l.data) leadById.set(l.id, l.data);
    }

    function companyForLead(lid: string): string | null {
      const ld = leadById.get(lid);
      if (!ld) return null;
      return (ld.company as string) || (ld.name as string) || null;
    }

    // ── Path A: depositNumber ──────────────────────────────────────────────────
    if (depositNumParam && !leadIdParam) {
      const matched = deposits.filter((dep) => {
        const num = dep.data?.deposit_request_number as string | undefined;
        return typeof num === "string" &&
          num.toLowerCase() === depositNumParam.toLowerCase();
      });

      if (matched.length === 0) {
        return errResponse(
          `No deposit request found with number "${depositNumParam}". Check the number and try again.`,
          404,
        );
      }

      const deposit  = matched[0];
      const lid      = (deposit.data?.lead_id as string) ?? "";
      const company  = lid ? companyForLead(lid) : null;
      const allForLead = lid
        ? deposits.filter((d) => (d.data?.lead_id as string) === lid)
        : [deposit];
      const total    = allForLead.length;
      const selectionNote =
        `${depositNumParam} requested directly. This lead has ${total} deposit request(s) total.`;

      return buildPreview(deposit, lid, company, total, selectionNote);
    }

    // ── Path B: q — company name search ───────────────────────────────────────
    if (qParam && !leadIdParam) {
      const term = qParam.toLowerCase();
      const matchedLeads = leads.filter((l) => {
        const name =
          (l.data?.company as string) || (l.data?.name as string) || "";
        return name.toLowerCase().includes(term);
      });

      if (matchedLeads.length === 0) {
        return errResponse(
          `No CRM lead found matching company "${qParam}". Try a different spelling or use leadId directly.`,
          404,
        );
      }

      if (matchedLeads.length > 1) {
        return okResponse({
          ambiguous:  true,
          matchCount: matchedLeads.length,
          message:    `${matchedLeads.length} leads match "${qParam}". Which one did you mean?`,
          matches: matchedLeads.slice(0, 5).map((l) => ({
            leadId:  l.id,
            company: (l.data?.company as string) || (l.data?.name as string) || null,
            stage:   (l.data?.stage as string) ?? null,
          })),
        });
      }

      const lead    = matchedLeads[0];
      const lid     = lead.id;
      const company = companyForLead(lid);
      const forLead = sortByRecency(
        deposits.filter((d) => (d.data?.lead_id as string) === lid),
      );

      if (forLead.length === 0) {
        return okResponse({
          leadId:             lid,
          company,
          hasExistingDeposit: false,
          message:
            "No deposit request has been generated for this lead yet. " +
            "Use Send Deposit in HQ to create one.",
        });
      }

      const selected   = forLead[0];
      const total      = forLead.length;
      const dn         = (selected.data?.deposit_request_number as string) ?? selected.id;
      const tsReason   = selected.data?.sent_date ? "sent"
                       : selected.data?.created_at ? "created"
                       : "generated";
      const selectionNote = total === 1
        ? "Only deposit request on file for this lead."
        : `${dn} selected — most recently ${tsReason} of ${total} deposit requests for this lead. Use depositNumber=<number> to pull a specific one.`;

      return buildPreview(selected, lid, company, total, selectionNote);
    }

    // ── Path C: leadId — direct lookup ─────────────────────────────────────────
    const lid     = leadIdParam as string;
    const company = companyForLead(lid);

    if (!leadById.has(lid)) {
      return errResponse("Lead not found", 404);
    }

    const forLead = sortByRecency(
      deposits.filter((d) => (d.data?.lead_id as string) === lid),
    );

    if (forLead.length === 0) {
      return okResponse({
        leadId:             lid,
        company,
        hasExistingDeposit: false,
        message:
          "No deposit request has been generated for this lead yet. " +
          "Use Send Deposit in HQ to create one.",
      });
    }

    const selected   = forLead[0];
    const total      = forLead.length;
    const dn         = (selected.data?.deposit_request_number as string) ?? selected.id;
    const tsReason   = selected.data?.sent_date ? "sent"
                     : selected.data?.created_at ? "created"
                     : "generated";
    const selectionNote = total === 1
      ? "Only deposit request on file for this lead."
      : `${dn} selected — most recently ${tsReason} of ${total} deposit requests for this lead. Use depositNumber=<number> to pull a specific one.`;

    return buildPreview(selected, lid, company, total, selectionNote);

  } catch (err) {
    console.error("[ai/deposit-preview GET]", err);
    return errResponse("Internal server error", 500);
  }
}
