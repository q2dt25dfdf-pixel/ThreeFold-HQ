import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import type { DashboardRecord } from "@/lib/dashboardMetrics";
import {
  type QuoteRow,
  selectBestQuote,
} from "@/lib/quoteSelection";
import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";

export const dynamic = "force-dynamic";

// ── GET /api/ai/quote-preview ──────────────────────────────────────────────────
//
// Read-only preview of the most recent quote for a CRM lead.
// CRITICAL: Never calls POST /api/quote/generate — that creates a real quote
// record with a sequential quote number on every invocation, even during the
// HQ "Preview Email" step. This endpoint only reads what already exists.
//
// Resolution priority (use the first param provided):
//   1. leadId     — direct UUID lookup (resolves via quotes table, NOT lead.quote_id)
//   2. quoteNumber — find and return that exact quote (bypasses recency sort)
//   3. company    — partial case-insensitive match on lead company name
//   4. contactName — partial case-insensitive match on lead contact field (PII
//                    used as lookup key only; never returned in response)
//
// "Most recent" quote selection (all paths except quoteNumber):
//   lead.quote_id is NOT used — it only updates when a quote email is actually
//   sent via HQ, so it misses newer drafts. Instead, all quotes for the lead
//   are fetched and sorted by recency:
//     1. acknowledgementAcceptedAt desc  (client approval — most significant event)
//     2. sent_date desc                  (quote was sent)
//     3. created_at desc                 (quote was generated)
//   The first (most recent) is returned along with totalQuotesForLead and
//   a selectionNote so the caller knows which quote was chosen and why.
//
// Ambiguity (company/contactName only): if multiple leads match, returns
//   ambiguous:true with a choices array — never guesses.

type LeadRow = { id: string; data: Record<string, unknown> | null };

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
  "If you have any questions at all, please don't hesitate to reach out.\n\n" +
  TF_PLAIN_CLOSING;

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

// ── Quote preview builder ──────────────────────────────────────────────────────

function buildPreviewResponse(
  leadId: string,
  leadData: Record<string, unknown>,
  quoteRow: QuoteRow,
  resolvedBy: string,
  totalQuotesForLead: number,
  selectionNote: string,
  selectionWarning?: string,
) {
  const qd = (quoteRow.data ?? {}) as Record<string, unknown>;

  const company         = (leadData.company as string) ?? null;
  const stage           = (leadData.stage as string) ?? null;
  const quoteId         = quoteRow.id;
  const quoteNumber     = (qd.quote_number as string) ?? (leadData.quote_number as string) ?? null;
  const quoteStatus     = (qd.status as string) ?? null;
  const expirationDate  = (qd.expiration_date as string) ?? null;
  const lineItems       = (qd.line_items as unknown[] | null) ?? null;
  const subtotal        = (qd.subtotal as number | null) ?? null;
  const salesTaxRate    = (qd.sales_tax_rate as number | null) ?? null;
  const salesTaxAmount  = (qd.sales_tax_amount as number | null) ?? null;
  const grandTotal      = (qd.grand_total as number | null) ?? null;
  const publicLink      = (qd.public_link as string | null) ?? null;
  const depositEstimate = grandTotal != null ? Math.round(grandTotal * 0.5 * 100) / 100 : null;

  // isRevised mirrors HQ SendQuoteModal: lead.stage === "Quote Sent"
  const isRevised = stage === "Quote Sent";
  // Jarvis never has the contact person (PII); fall back to company name
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
    hasExistingQuote:   true,
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
    totalQuotesForLead,
    selectionNote,
    selectionWarning: selectionWarning ?? null,
    emailSubject,
    emailBodyPreview,
  });
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function fetchLead(
  db: ReturnType<typeof getSupabaseAdmin>,
  leadId: string,
): Promise<LeadRow | null> {
  const { data: row, error } = await db
    .from("crm_leads")
    .select("id,data")
    .eq("id", leadId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== "42P01") {
    throw new Error(`[ai/quote-preview] fetch lead: ${error.message}`);
  }
  return row as LeadRow | null;
}

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

// ── Shared: resolve leadId → select best quote via status-aware sort ───────────
//
// Selection priority: sent quotes beat drafts; within a bucket, most recent wins.
// Multiple equally-valid candidates returns an ambiguous response — never guesses.
// A single draft-only quote is returned with selectionWarning so the founder can
// confirm before Jarvis proceeds to deposit-send.

async function resolveLeadQuote(
  db: ReturnType<typeof getSupabaseAdmin>,
  leadId: string,
  leadData: Record<string, unknown>,
  resolvedBy: string,
): Promise<Response> {
  const allQuotes = await fetchAllQuotes(db);
  const leadQuotes = allQuotes.filter((q) => (q.data?.lead_id as string) === leadId);

  if (leadQuotes.length === 0) {
    return okResponse({
      leadId,
      company: (leadData.company as string) ?? null,
      stage:   (leadData.stage as string) ?? null,
      hasExistingQuote: false,
      message:
        "No quote has been generated for this lead yet. Use Send Quote in HQ to generate one.",
    });
  }

  const result = selectBestQuote(leadQuotes);
  const total  = leadQuotes.length;

  if (result.kind === "ambiguous") {
    return okResponse({
      leadId,
      company:            (leadData.company as string) ?? null,
      stage:              (leadData.stage as string) ?? null,
      ambiguous:          true,
      matchCount:         result.candidates.length,
      totalQuotesForLead: total,
      message:            result.reason,
      candidates:         result.candidates,
    });
  }

  if (result.kind === "single") {
    return buildPreviewResponse(
      leadId, leadData, result.quote, resolvedBy, total, result.selectionNote, result.warning,
    );
  }

  // Unreachable: leadQuotes.length > 0 guarantees a single or ambiguous result
  return errResponse("Internal server error", 500);
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
    // Returns the exact requested quote — no recency sort, no lead.quote_id.
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

      const quoteRow   = matched[0];
      const quoteLeadId = (quoteRow.data?.lead_id as string) ?? null;

      if (!quoteLeadId) {
        return errResponse(
          `Quote ${quoteNumberParam} exists but has no linked lead. Check HQ for data integrity.`,
          404,
        );
      }

      const leadRow = await fetchLead(db, quoteLeadId);
      const leadData = (leadRow?.data ?? { id: quoteLeadId }) as Record<string, unknown>;

      // Count total quotes for this lead so the caller can discover siblings
      const allQuotesForLead = allQuotes.filter(
        (q) => (q.data?.lead_id as string) === quoteLeadId,
      );
      const total = allQuotesForLead.length;
      const selectionNote =
        total === 1
          ? "Only quote on file for this lead."
          : `${quoteNumberParam} requested directly. This lead has ${total} quote(s) total.`;

      return buildPreviewResponse(quoteLeadId, leadData, quoteRow, "quoteNumber", total, selectionNote);
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
        matches   = allLeads.filter(
          (l) => typeof l.data?.company === "string" && l.data.company.toLowerCase().includes(q),
        );
        resolvedBy = "company";
        searchTerm = companyParam;
      } else {
        // contactName — lookup key only; never returned in response
        const q = (contactNameParam as string).toLowerCase();
        matches   = allLeads.filter(
          (l) => typeof l.data?.contact === "string" && l.data.contact.toLowerCase().includes(q),
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
          ambiguous:  true,
          resolvedBy,
          searchTerm,
          matchCount: matches.length,
          message:    `${matches.length} leads match "${searchTerm}". Which one did you mean?`,
          matches: matches.map((l) => {
            const d = (l.data ?? {}) as Record<string, unknown>;
            return {
              leadId:      l.id,
              company:     (d.company as string) ?? null,
              stage:       (d.stage as string) ?? null,
              quoteNumber: (d.quote_number as string) ?? null,
            };
          }),
        });
      }

      resolvedLeadId   = matches[0].id;
      resolvedLeadData = (matches[0].data ?? { id: resolvedLeadId }) as Record<string, unknown>;

      return resolveLeadQuote(db, resolvedLeadId, resolvedLeadData, resolvedBy);
    }

    // ── Path C: leadId — direct lookup ──────────────────────────────────────
    const leadRow = await fetchLead(db, leadIdParam);
    if (!leadRow) return errResponse("Lead not found", 404);

    resolvedLeadId   = leadIdParam;
    resolvedLeadData = (leadRow.data ?? { id: leadIdParam }) as Record<string, unknown>;

    return resolveLeadQuote(db, resolvedLeadId, resolvedLeadData, "leadId");

  } catch (err) {
    console.error("[ai/quote-preview GET]", err);
    return errResponse("Internal server error", 500);
  }
}
