import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── GET /api/ai/quote-preview ──────────────────────────────────────────────────
//
// Read-only preview of the most recent quote for a CRM lead.
// CRITICAL: Never calls POST /api/quote/generate — that creates a real quote
// record with a sequential quote number on every invocation, even during the
// HQ "Preview Email" step. This endpoint only reads what already exists.
//
// Resolution priority (use the first param provided):
//   1. leadId     — direct UUID lookup (existing behavior, unchanged)
//   2. quoteNumber — find quote by number → use that quote + its lead for context
//   3. company    — partial case-insensitive match on lead company name
//   4. contactName — partial case-insensitive match on lead contact field (PII
//                    used as lookup key only; never returned in response)
//
// Ambiguity: if company or contactName matches multiple leads, returns a 200
// with ambiguous:true and a choices array — never guesses.

type LeadRow = { id: string; data: Record<string, unknown> | null };
type QuoteRow = { id: string; data: Record<string, unknown> | null };

// ── Formatting helpers ─────────────────────────────────────────────────────────

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

// ── Email body templates (match HQ SendQuoteModal exactly) ─────────────────────

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
  return (
    `Hi ${contactName},\n\n` +
    `Thank you for considering Threefold Supply Co.! We've prepared a custom quote for your project.\n\n` +
    `Quote Number: ${quoteNumber ?? "[QUOTE NUMBER]"}\n` +
    `Project Total: ${grandTotal != null ? fmtCurrency(grandTotal) : "[QUOTE TOTAL]"}\n` +
    `Valid Through: ${expirationDate ? fmtDate(expirationDate) : "[EXPIRY DATE]"}\n\n` +
    `View your full quote — including pricing breakdown — here:\n${publicLink ?? "[QUOTE LINK]"}\n\n` +
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
  return (
    `Hello ${contactName},\n\n` +
    `We've updated your quote based on the changes discussed and attached the revised pricing for your review.\n\n` +
    `You can view your updated quote and pricing breakdown here:\n${publicLink ?? "[REVISED QUOTE LINK]"}\n\n` +
    `Please take a look and let us know if everything looks correct. If you'd like to make any additional adjustments, simply reply to this email and we'll be happy to update it further.\n\n` +
    `Once you're ready to move forward, you can approve the quote directly from the quote page.\n\n` +
    `Quote Number: ${quoteNumber ?? "[QUOTE NUMBER]"}\n` +
    `Project Total: ${grandTotal != null ? fmtCurrency(grandTotal) : "[QUOTE TOTAL]"}\n` +
    `Valid Through: ${expirationDate ? fmtDate(expirationDate) : "[EXPIRY DATE]"}\n\n` +
    SHARED_TAIL
  );
}

// ── Quote preview builder — shared by all resolution paths ─────────────────────

function buildPreviewResponse(
  leadId: string,
  leadData: Record<string, unknown>,
  quoteData: Record<string, unknown>,
  resolvedBy: string,
) {
  const company = (leadData.company as string) ?? null;
  const stage = (leadData.stage as string) ?? null;

  const quoteId = (quoteData.id as string) ?? null;
  const quoteNumber =
    (quoteData.quote_number as string) ??
    (leadData.quote_number as string) ??
    null;
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

  // isRevised mirrors HQ SendQuoteModal: lead.stage === "Quote Sent"
  const isRevised = stage === "Quote Sent";
  // Contact name: Jarvis never has the contact person (PII); fall back to company
  const contactName = company ?? "there";

  const emailSubject = isRevised
    ? "Updated Quote from Threefold Supply Co."
    : "Your Custom Quote from Threefold Supply Co.";

  const emailBodyPreview = isRevised
    ? buildRevisedQuoteBody(contactName, quoteNumber, grandTotal, expirationDate, publicLink)
    : buildNewQuoteBody(contactName, quoteNumber, grandTotal, expirationDate, publicLink);

  return okResponse({
    leadId,
    company,
    stage,
    hasExistingQuote: true,
    resolvedBy,
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
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function fetchAllLeads(
  db: ReturnType<typeof getSupabaseAdmin>,
): Promise<LeadRow[]> {
  const { data: rows, error } = await db
    .from("crm_leads")
    .select("id,data");
  if (error && (error as { code?: string }).code !== "42P01") {
    throw new Error(`[ai/quote-preview] fetch leads: ${error.message}`);
  }
  return (rows ?? []) as LeadRow[];
}

async function fetchAllQuotes(
  db: ReturnType<typeof getSupabaseAdmin>,
): Promise<QuoteRow[]> {
  const { data: rows, error } = await db
    .from("quotes")
    .select("id,data");
  if (error && (error as { code?: string }).code !== "42P01") {
    throw new Error(`[ai/quote-preview] fetch quotes: ${error.message}`);
  }
  return (rows ?? []) as QuoteRow[];
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  const url = new URL(request.url);
  const leadIdParam      = url.searchParams.get("leadId")?.trim()      || null;
  const quoteNumberParam = url.searchParams.get("quoteNumber")?.trim() || null;
  const companyParam     = url.searchParams.get("company")?.trim()     || null;
  const contactNameParam = url.searchParams.get("contactName")?.trim() || null;

  if (!leadIdParam && !quoteNumberParam && !companyParam && !contactNameParam) {
    return errResponse(
      "Provide at least one of: leadId, quoteNumber, company, or contactName",
      400,
    );
  }

  try {
    const db = getSupabaseAdmin();

    // ── Path A: quoteNumber (and no leadId) ─────────────────────────────────
    // Look up the exact quote, then get its lead for context.
    // The founder asked for a specific quote by number — return that exact quote
    // rather than whatever lead.quote_id currently points to.
    if (quoteNumberParam && !leadIdParam) {
      const allQuotes = await fetchAllQuotes(db);
      const matched = allQuotes.filter(
        (q) =>
          typeof q.data?.quote_number === "string" &&
          q.data.quote_number.toLowerCase() === quoteNumberParam.toLowerCase(),
      );

      if (matched.length === 0) {
        return errResponse(
          `No quote found with number "${quoteNumberParam}". Check the quote number and try again.`,
          404,
        );
      }

      // Quote numbers are unique — treat multiple as a data integrity issue
      const quoteRow = matched[0];
      const quoteData = (quoteRow.data ?? {}) as Record<string, unknown>;
      // Attach id so buildPreviewResponse can read quoteData.id
      quoteData.id = quoteRow.id;

      const quoteLeadId = (quoteData.lead_id as string) ?? null;
      if (!quoteLeadId) {
        return errResponse(
          `Quote ${quoteNumberParam} exists but has no linked lead. Check HQ for data integrity.`,
          404,
        );
      }

      // Fetch lead for context (company, stage)
      const { data: leadRow, error: leadErr } = await db
        .from("crm_leads")
        .select("id,data")
        .eq("id", quoteLeadId)
        .maybeSingle();

      if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/quote-preview] lead lookup: ${leadErr.message}`);
      }

      const leadData = (((leadRow as LeadRow | null)?.data) ?? { id: quoteLeadId }) as Record<string, unknown>;

      return buildPreviewResponse(quoteLeadId, leadData, quoteData, "quoteNumber");
    }

    // ── Path B: company or contactName — resolve to one leadId ──────────────
    let resolvedLeadId: string;
    let resolvedLeadData: Record<string, unknown>;

    if (!leadIdParam) {
      const allLeads = await fetchAllLeads(db);

      let matches: LeadRow[];
      let resolvedBy: string;
      let searchTerm: string;

      if (companyParam) {
        const q = companyParam.toLowerCase();
        matches = allLeads.filter(
          (l) =>
            typeof l.data?.company === "string" &&
            l.data.company.toLowerCase().includes(q),
        );
        resolvedBy = "company";
        searchTerm = companyParam;
      } else {
        // contactName — used as lookup key only; never returned in response
        const q = (contactNameParam as string).toLowerCase();
        matches = allLeads.filter(
          (l) =>
            typeof l.data?.contact === "string" &&
            l.data.contact.toLowerCase().includes(q),
        );
        resolvedBy = "contactName";
        searchTerm = contactNameParam as string;
      }

      if (matches.length === 0) {
        return errResponse(
          `No CRM lead found matching ${resolvedBy === "company" ? "company" : "contact name"} "${searchTerm}". ` +
            `Try a different spelling or use leadId directly.`,
          404,
        );
      }

      if (matches.length > 1) {
        return okResponse({
          ambiguous: true,
          resolvedBy,
          searchTerm,
          matchCount: matches.length,
          message:
            `${matches.length} leads match "${searchTerm}". Which one did you mean?`,
          matches: matches.map((l) => {
            const d = (l.data ?? {}) as Record<string, unknown>;
            return {
              leadId: l.id,
              company: (d.company as string) ?? null,
              stage: (d.stage as string) ?? null,
              quoteNumber: (d.quote_number as string) ?? null,
            };
          }),
        });
      }

      resolvedLeadId = matches[0].id;
      resolvedLeadData = (matches[0].data ?? { id: resolvedLeadId }) as Record<string, unknown>;
    } else {
      // ── Path C: leadId — direct lookup (existing behavior) ─────────────────
      const { data: leadRow, error: leadErr } = await db
        .from("crm_leads")
        .select("id,data")
        .eq("id", leadIdParam)
        .maybeSingle();

      if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/quote-preview] lead lookup: ${leadErr.message}`);
      }
      if (!leadRow) {
        return errResponse("Lead not found", 404);
      }

      resolvedLeadId = leadIdParam;
      resolvedLeadData = (((leadRow as LeadRow).data) ?? { id: leadIdParam }) as Record<string, unknown>;
    }

    // ── Common tail: lead resolved → look up quote via lead.quote_id ─────────
    const quoteId = (resolvedLeadData.quote_id as string) ?? null;

    if (!quoteId) {
      return okResponse({
        leadId: resolvedLeadId,
        company: (resolvedLeadData.company as string) ?? null,
        stage: (resolvedLeadData.stage as string) ?? null,
        hasExistingQuote: false,
        message:
          "No quote has been generated for this lead yet. Use Send Quote in HQ to generate one.",
      });
    }

    const { data: quoteRow, error: quoteErr } = await db
      .from("quotes")
      .select("id,data")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteErr && (quoteErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/quote-preview] quote lookup: ${quoteErr.message}`);
    }

    if (!quoteRow) {
      return okResponse({
        leadId: resolvedLeadId,
        company: (resolvedLeadData.company as string) ?? null,
        stage: (resolvedLeadData.stage as string) ?? null,
        hasExistingQuote: false,
        message: `Quote ID on file (${quoteId}) but the quote record was not found. Check HQ for data integrity.`,
      });
    }

    const quoteData = ((quoteRow as QuoteRow).data ?? {}) as Record<string, unknown>;
    quoteData.id = (quoteRow as QuoteRow).id;

    const resolvedBy = leadIdParam ? "leadId" : companyParam ? "company" : "contactName";
    return buildPreviewResponse(resolvedLeadId, resolvedLeadData, quoteData, resolvedBy);

  } catch (err) {
    console.error("[ai/quote-preview GET]", err);
    return errResponse("Internal server error", 500);
  }
}
