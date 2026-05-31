import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── GET /api/ai/quote-preview?leadId={id} ─────────────────────────────────────
//
// Read-only preview of the most recent quote for a CRM lead.
// Fetches the existing quote stored on the lead (via lead.quote_id).
// Returns line items, totals, tax, deposit estimate, and email templates
// matching the HQ SendQuoteModal templates exactly.
//
// CRITICAL: Never calls POST /api/quote/generate — that endpoint creates a real
// quote record with a sequential quote number on every invocation, even during
// HQ's own "Preview Email" step. This endpoint only reads what already exists.

type TableRow = { id: string; data: DashboardRecord | null };
type QuoteRow = { id: string; data: Record<string, unknown> | null };

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const SHARED_TAIL =
  "This quote is valid for 30 days.\n\n" +
  "To move forward, we require a 50% deposit before production begins. " +
  "The remaining 50% balance is due before the completed order is delivered or shipped.\n\n" +
  "If everything looks good, simply reply to this email, give us a call, or send us a text. " +
  "We'll prepare and send your deposit invoice separately and get your project into production.\n\n" +
  "If you have any questions at all, please don't hesitate to reach out.\n\nBest,";

function buildNewQuoteBody(
  contactName: string,
  quoteNumber: string | null,
  grandTotal: number | null,
  expirationDate: string | null,
  publicLink: string | null,
): string {
  const qNum = quoteNumber ?? "[QUOTE NUMBER]";
  const total = grandTotal != null ? fmtCurrency(grandTotal) : "[QUOTE TOTAL]";
  const expiry = expirationDate ? fmtDate(expirationDate) : "[EXPIRY DATE]";
  const link = publicLink ?? "[QUOTE LINK]";

  return (
    `Hi ${contactName},\n\n` +
    `Thank you for considering Threefold Supply Co.! We've prepared a custom quote for your project.\n\n` +
    `Quote Number: ${qNum}\n` +
    `Project Total: ${total}\n` +
    `Valid Through: ${expiry}\n\n` +
    `View your full quote — including pricing breakdown — here:\n${link}\n\n` +
    SHARED_TAIL
  );
}

function buildRevisedQuoteBody(
  contactName: string,
  quoteNumber: string | null,
  grandTotal: number | null,
  expirationDate: string | null,
  publicLink: string | null,
): string {
  const qNum = quoteNumber ?? "[QUOTE NUMBER]";
  const total = grandTotal != null ? fmtCurrency(grandTotal) : "[QUOTE TOTAL]";
  const expiry = expirationDate ? fmtDate(expirationDate) : "[EXPIRY DATE]";
  const link = publicLink ?? "[REVISED QUOTE LINK]";

  return (
    `Hello ${contactName},\n\n` +
    `We've updated your quote based on the changes discussed and attached the revised pricing for your review.\n\n` +
    `You can view your updated quote and pricing breakdown here:\n${link}\n\n` +
    `Please take a look and let us know if everything looks correct. If you'd like to make any additional adjustments, simply reply to this email and we'll be happy to update it further.\n\n` +
    `Once you're ready to move forward, you can approve the quote directly from the quote page.\n\n` +
    `Quote Number: ${qNum}\n` +
    `Project Total: ${total}\n` +
    `Valid Through: ${expiry}\n\n` +
    SHARED_TAIL
  );
}

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  // ── Read leadId from query params ──────────────────────────────────────────
  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");

  if (!leadId || !leadId.trim()) {
    return errResponse("leadId query parameter is required", 400);
  }

  const resolvedLeadId = leadId.trim();

  try {
    const db = getSupabaseAdmin();

    // ── Fetch lead ────────────────────────────────────────────────────────────
    const { data: leadRow, error: leadErr } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", resolvedLeadId)
      .maybeSingle();

    if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/quote-preview GET] lead lookup: ${leadErr.message}`);
    }
    if (!leadRow) {
      return errResponse("Lead not found", 404);
    }

    const leadData = ((leadRow as TableRow).data ?? { id: resolvedLeadId }) as Record<string, unknown>;
    const company = (leadData.company as string) ?? null;
    const stage = (leadData.stage as string) ?? null;
    const quoteId = (leadData.quote_id as string) ?? null;
    const leadQuoteNumber = (leadData.quote_number as string) ?? null;

    // ── No quote on file ──────────────────────────────────────────────────────
    if (!quoteId) {
      return okResponse({
        leadId: resolvedLeadId,
        company,
        stage,
        hasExistingQuote: false,
        message:
          "No quote has been generated for this lead yet. Use Send Quote in HQ to generate one.",
      });
    }

    // ── Fetch quote ───────────────────────────────────────────────────────────
    const { data: quoteRow, error: quoteErr } = await db
      .from("quotes")
      .select("id,data")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteErr && (quoteErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/quote-preview GET] quote lookup: ${quoteErr.message}`);
    }

    // Data integrity issue: lead has quote_id but the record is gone
    if (!quoteRow) {
      return okResponse({
        leadId: resolvedLeadId,
        company,
        stage,
        hasExistingQuote: false,
        message: `Quote ID on file (${quoteId}) but the quote record was not found. Check HQ for data integrity.`,
      });
    }

    const quoteData = ((quoteRow as QuoteRow).data ?? {}) as Record<string, unknown>;

    const quoteNumber = (quoteData.quote_number as string) ?? leadQuoteNumber ?? null;
    const quoteStatus = (quoteData.status as string) ?? null;
    const expirationDate = (quoteData.expiration_date as string) ?? null;
    const lineItems = (quoteData.line_items as unknown[] | null) ?? null;
    const subtotal = (quoteData.subtotal as number | null) ?? null;
    const salesTaxRate = (quoteData.sales_tax_rate as number | null) ?? null;
    const salesTaxAmount = (quoteData.sales_tax_amount as number | null) ?? null;
    const grandTotal = (quoteData.grand_total as number | null) ?? null;
    const publicLink = (quoteData.public_link as string | null) ?? null;

    const depositEstimate =
      grandTotal != null ? Math.round(grandTotal * 0.5 * 100) / 100 : null;

    // isRevised = true when the lead is already at "Quote Sent" stage,
    // matching the HQ SendQuoteModal logic (lead.stage === "Quote Sent").
    const isRevised = stage === "Quote Sent";

    // contactName: Jarvis never has the contact person's name (PII).
    // Fall back to company name, matching the modal's (lead.contact || lead.company) pattern.
    const contactName = company ?? "there";

    const emailSubject = isRevised
      ? "Updated Quote from Threefold Supply Co."
      : "Your Custom Quote from Threefold Supply Co.";

    const emailBodyPreview = isRevised
      ? buildRevisedQuoteBody(contactName, quoteNumber, grandTotal, expirationDate, publicLink)
      : buildNewQuoteBody(contactName, quoteNumber, grandTotal, expirationDate, publicLink);

    return okResponse({
      leadId: resolvedLeadId,
      company,
      stage,
      hasExistingQuote: true,
      quoteId,
      quoteNumber,
      quoteStatus,
      expirationDate,
      lineItems,
      subtotal,
      salesTaxRate,
      salesTaxAmount,
      grandTotal,
      depositEstimate,
      publicLink,
      isRevised,
      emailSubject,
      emailBodyPreview,
    });
  } catch (err) {
    console.error("[ai/quote-preview GET]", err);
    return errResponse("Internal server error", 500);
  }
}
