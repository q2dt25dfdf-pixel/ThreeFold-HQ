import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import {
  calcSalesTax,
  calcGrandTotal,
  calcDiscountedSubtotal,
  normalizeDiscount,
} from "@/lib/salesTax";
import { getSalesTaxRateForAddress } from "@/lib/tax-rates";
import { getQuoteBaseUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

// ── POST /api/ai/quote-create ──────────────────────────────────────────────
//
// Jarvis action: creates a draft quote for an existing CRM lead.
// Requires founder confirmation (confirm: true) before Jarvis calls this.
//
// Requires:
//   - confirm: true (boolean, strict equality)
//   - leadId or company to identify the lead (company triggers fuzzy match)
//   - lineItems: at least one item with name, quantity > 0, unitPrice >= 0
//   - revisedQuote: true if any quote already exists for the lead
//
// Does NOT:
//   - Send any email
//   - Update lead stage, value, or communicationHistory
//   - Mark the quote as sent
//   - Return publicToken or clientEmail

// Mirrors QUOTE_ITEM_PRESETS in SendQuoteModal.tsx — keep in sync.
const KNOWN_PRODUCTS: Record<string, { defaultPrice: number; description: string }> = {
  "Custom Performance Dri-Fit Tee": {
    defaultPrice: 40,
    description:
      "Premium moisture-wicking performance apparel custom designed around your company's identity, culture, and team. Includes original artwork, mockups, revisions, and production-ready graphics.",
  },
};

type InputLineItem = {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice?: number; // explicit override; auto-detected from KNOWN_PRODUCTS when omitted
};

type ComputedLineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number; // present only when unitPrice < default price
};

type LeadRow = { id: string; data: Record<string, unknown> | null };
type QuoteRow = { id: string; data: Record<string, unknown> | null };

function validateLineItems(items: unknown): items is InputLineItem[] {
  if (!Array.isArray(items) || items.length === 0) return false;
  for (const item of items) {
    if (typeof item !== "object" || item === null) return false;
    const i = item as Record<string, unknown>;
    if (typeof i.name !== "string" || !i.name.trim()) return false;
    if (
      typeof i.quantity !== "number" ||
      !Number.isFinite(i.quantity) ||
      i.quantity <= 0
    ) return false;
    if (
      typeof i.unitPrice !== "number" ||
      !Number.isFinite(i.unitPrice) ||
      i.unitPrice < 0
    ) return false;
    // originalUnitPrice is optional but must be a positive number if present
    if (
      i.originalUnitPrice !== undefined &&
      (typeof i.originalUnitPrice !== "number" ||
        !Number.isFinite(i.originalUnitPrice) ||
        i.originalUnitPrice <= 0)
    ) return false;
  }
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const {
    leadId,
    company,
    lineItems: rawLineItems,
    notes,
    revisedQuote,
    confirm,
    deliveryZip,
    clientZip,
    discount: rawDiscount,
  } = body as Record<string, unknown>;

  // ── Require confirm: true ─────────────────────────────────────────────────
  if (confirm !== true) {
    return errResponse(
      "confirm: true is required. Show the proposed quote to the founder and ask for confirmation before calling this endpoint.",
      400,
    );
  }

  // ── Validate lineItems ────────────────────────────────────────────────────
  if (!validateLineItems(rawLineItems)) {
    return errResponse(
      "lineItems is required: array of at least one item with name (string), quantity (number > 0), unitPrice (number >= 0).",
      400,
    );
  }
  const inputLineItems = rawLineItems as InputLineItem[];

  // ── Validate discount (optional) ──────────────────────────────────────────
  const discount = normalizeDiscount(rawDiscount);
  if (discount && !discount.label) {
    return errResponse("A discount requires a label.", 400);
  }

  // ── Require leadId or company ─────────────────────────────────────────────
  const hasLeadId  = leadId  && typeof leadId  === "string" && leadId.trim();
  const hasCompany = company && typeof company === "string" && company.trim();
  if (!hasLeadId && !hasCompany) {
    return errResponse("leadId or company is required.", 400);
  }

  try {
    const db = getSupabaseAdmin();
    let lead: LeadRow | null = null;
    let resolvedBy = "leadId";

    // ── Lead resolution ───────────────────────────────────────────────────
    if (hasLeadId) {
      const { data: row, error } = await db
        .from("crm_leads")
        .select("id,data")
        .eq("id", (leadId as string).trim())
        .maybeSingle();
      if (error && (error as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/quote-create] fetch lead: ${error.message}`);
      }
      lead = row as LeadRow | null;
      if (!lead) {
        return errResponse(`No CRM lead found with id "${leadId}".`, 404);
      }
    } else {
      const { data: rows, error } = await db
        .from("crm_leads")
        .select("id,data");
      if (error && (error as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/quote-create] fetch leads: ${error.message}`);
      }
      const allLeads = (rows ?? []) as LeadRow[];
      const query = (company as string).trim().toLowerCase();
      const matches = allLeads.filter((r) => {
        const comp = ((r.data?.company as string) ?? "").toLowerCase();
        return comp.includes(query);
      });

      if (matches.length === 0) {
        return errResponse(`No CRM lead found matching company "${company}".`, 404);
      }
      if (matches.length > 1) {
        return okResponse({
          ambiguous: true,
          matchCount: matches.length,
          message: `${matches.length} leads match "${company}". Provide leadId to proceed.`,
          choices: matches.map((r) => ({
            leadId:  r.id,
            company: (r.data?.company as string) ?? null,
            stage:   (r.data?.stage as string) ?? null,
          })),
        });
      }
      lead = matches[0];
      resolvedBy = "company";
    }

    const leadData = (lead.data ?? {}) as Record<string, unknown>;
    const resolvedLeadId = lead.id;
    const companyName = (leadData.company as string) ?? null;
    const stage = (leadData.stage as string) ?? null;

    // ── Duplicate protection ──────────────────────────────────────────────
    const { data: existingRows, error: quotesErr } = await db
      .from("quotes")
      .select("id,data")
      .filter("data->>lead_id", "eq", resolvedLeadId);

    if (quotesErr && (quotesErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/quote-create] fetch quotes: ${quotesErr.message}`);
    }

    const existingQuotes = (existingRows ?? []) as QuoteRow[];

    if (existingQuotes.length > 0 && revisedQuote !== true) {
      const sentOrApproved = existingQuotes.filter((q) => {
        const s = (q.data?.status as string) ?? "";
        return s === "sent" || s === "approved";
      });
      const kind = sentOrApproved.length > 0 ? "sent/approved" : "draft";
      return errResponse(
        `Lead "${companyName ?? resolvedLeadId}" already has ${existingQuotes.length} quote(s) (${kind}). ` +
        `Set revisedQuote: true to create an additional quote for this lead.`,
        409,
      );
    }

    // ── Compute line items and subtotal ───────────────────────────────────
    const computedLineItems: ComputedLineItem[] = inputLineItems.map((item) => {
      const trimmedName = item.name.trim();
      const known       = KNOWN_PRODUCTS[trimmedName];

      // Resolve originalUnitPrice:
      //   1. Use explicit value from request if provided
      //   2. Fall back to KNOWN_PRODUCTS default price
      //   3. Only store it when it's strictly greater than unitPrice (i.e. a real discount)
      const candidateOriginal = item.originalUnitPrice ?? known?.defaultPrice;
      const originalUnitPrice =
        candidateOriginal != null && candidateOriginal > item.unitPrice
          ? candidateOriginal
          : undefined;

      // Auto-fill description from catalog if caller left it blank
      const description =
        (item.description ?? "").trim() || (known?.description ?? "");

      const out: ComputedLineItem = {
        name:        trimmedName,
        description,
        quantity:    item.quantity,
        unitPrice:   item.unitPrice,
        lineTotal:   Math.round(item.quantity * item.unitPrice * 100) / 100,
      };
      if (originalUnitPrice !== undefined) out.originalUnitPrice = originalUnitPrice;
      return out;
    });
    const subtotal = computedLineItems.reduce((sum, i) => sum + i.lineTotal, 0);

    // ── Tax calculation ───────────────────────────────────────────────────
    const taxLookup = getSalesTaxRateForAddress({
      deliveryZip: typeof deliveryZip === "string" ? deliveryZip : undefined,
      clientZip:   typeof clientZip === "string" ? clientZip : undefined,
      clientAddressText: "",
    });
    // Order of operations: subtotal → discount → discountedSubtotal → tax → grand.
    // subtotal stays PRE-discount; with no discount, discountedSubtotal === subtotal
    // so tax/grand are byte-identical to the old behavior.
    const taxRate = taxLookup.rate;
    const discountedSubtotal = discount
      ? calcDiscountedSubtotal(subtotal, discount)
      : subtotal;
    // A discount must not drive the total near zero. Stripe rejects charges under
    // ~$0.50 and a sub-dollar order is not a real order, so require at least $1.00
    // pre-tax after the discount — the only path that can produce a tiny total.
    if (discount && discountedSubtotal < 1) {
      return errResponse(
        "A discount cannot reduce the total below $1.00.",
        400,
      );
    }
    const salesTaxAmount = calcSalesTax(discountedSubtotal, taxRate);
    const grandTotal = calcGrandTotal(discountedSubtotal, taxRate);

    // ── Quote number ──────────────────────────────────────────────────────
    // Sequential: count all existing quotes + 1 (matches /api/quote/generate logic)
    const year = new Date().getFullYear();
    const { count } = await db.from("quotes").select("*", { count: "exact", head: true });
    const quoteNumber = `TF-Q-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

    // ── Build and persist quote record ────────────────────────────────────
    const token   = "tfq-" + randomBytes(12).toString("hex");
    const publicLink = `${getQuoteBaseUrl(new URL(request.url).origin)}/quote/${token}`;
    const quoteId = `quote-${resolvedLeadId}-${Date.now()}`;
    const expirationDate = addDaysToISODate(businessTodayISO(), 30);
    const isRevised = stage === "Quote Sent";

    const quoteData = {
      id:                     quoteId,
      quote_number:           quoteNumber,
      lead_id:                resolvedLeadId,
      client_name:            companyName ?? "",
      client_email:           "",  // never stored from Jarvis
      items:                  computedLineItems.map((i) => i.name),
      line_items:             computedLineItems,
      subtotal:               Math.round(subtotal * 100) / 100,
      discount:               discount,
      sales_tax_rate:         taxRate,
      sales_tax_amount:       salesTaxAmount,
      grand_total:            Math.round(grandTotal * 100) / 100,
      total_amount:           Math.round(grandTotal * 100) / 100,
      tax_rate_percent:       taxRate,
      tax_rate_source:        taxLookup.source,
      tax_zip_used:           taxLookup.zipUsed ?? null,
      tax_jurisdiction_label: taxLookup.jurisdictionLabel,
      tax_rate_warning:       taxLookup.warning ?? null,
      expiration_date:        expirationDate,
      public_token:           token,  // stored but never returned to Jarvis
      public_link:            publicLink,
      status:                 "draft",
      notes:                  typeof notes === "string" ? notes.trim() : "",
      sent_date:              null,
      email_status:           null,
      email_message_id:       null,
      created_at:             new Date().toISOString(),
      created_via:            "jarvis",
    };

    const { error: upsertErr } = await db
      .from("quotes")
      .upsert({ id: quoteId, data: quoteData });

    if (upsertErr) {
      console.error("[ai/quote-create POST] upsert error:", upsertErr);
      return errResponse(`Failed to create quote: ${upsertErr.message}`, 500);
    }

    const depositEstimate = Math.round(grandTotal * 0.5 * 100) / 100;

    return okResponse({
      quoteId,
      quoteNumber,
      leadId:             resolvedLeadId,
      company:            companyName,
      stage,
      isRevised,
      resolvedBy,
      existingQuoteCount: existingQuotes.length,
      lineItems:          computedLineItems,
      subtotal:           Math.round(subtotal * 100) / 100,
      discount,
      salesTaxRate:       taxRate,
      salesTaxAmount,
      grandTotal:         Math.round(grandTotal * 100) / 100,
      depositEstimate,
      expirationDate,
      publicLink,
      taxRateSource:      taxLookup.source,
      taxRateWarning:     taxLookup.warning ?? null,
      status:             "draft",
      notes:              quoteData.notes,
      nextStep:
        "Review the created draft quote above. Call GET /api/ai/quote-preview with this quoteId " +
        "to verify, then ask if the founder wants to send it via POST /api/ai/quote-send.",
      createdVia: "jarvis",
    });
  } catch (err) {
    console.error("[ai/quote-create POST]", err);
    return errResponse("Internal server error", 500);
  }
}
