import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO } from "@/lib/businessDate";
import { type QuoteRow, selectBestQuote } from "@/lib/quoteSelection";
import { getPublicBaseUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

// ── POST /api/ai/deposit-send ──────────────────────────────────────────────────
//
// JARVIS WORKFLOW (enforced by design — do not bypass):
//   1. GET /api/ai/deposit-preview    → show full preview to founder
//   2. Ask: "Send this deposit request to [company]?"
//   3. Only after explicit "yes": POST /api/ai/deposit-send with confirm: true
//
// Reuse existing deposit when lead.deposit_request_id exists.
// Block double-send: 409 when deposit status === "sent".
// Only create new deposit record when no deposit_request_id exists on lead.
// Amounts for new deposits: pulled from linked quote record, then lead value.
// NEVER recomputes totals — reads what is already stored.
// REQUIRES RESEND_API_KEY — without it, returns 503.
//
// Side effects (mirrors handleDepositSent):
//   - deposit_requests: status → "sent", sent_date, email_status, email_message_id
//   - crm_leads: deposit_request_id, deposit_request_number, communicationHistory

const VALID_SENDERS = new Set(["Alliyah", "Hannah", "Jordan"]);

// ── Email template (identical to /api/send-email wrapInEmailTemplate) ──────────

function toHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>\n");
}

function wrapInEmailTemplate(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:48px 32px 64px;">
  <div style="font-size:11px;font-weight:800;letter-spacing:0.22em;color:#0a0a0a;margin-bottom:4px;">THREEFOLD SUPPLY CO.</div>
  <div style="font-size:10px;letter-spacing:0.08em;color:#6F685D;margin-bottom:32px;">Made by three, worn by all.</div>
  <div style="height:1px;background:#DDD6CB;margin-bottom:32px;"></div>
  <div style="font-size:15px;color:#332E28;line-height:1.75;">
    ${toHtml(body)}
  </div>
  <div style="height:1px;background:#DDD6CB;margin-top:40px;margin-bottom:24px;"></div>
  <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;color:#756D62;margin-bottom:4px;">THREEFOLD SUPPLY CO.</div>
  <div style="font-size:10px;color:#7F776B;letter-spacing:0.06em;">Made by three, worn by all.</div>
</div>
</body>
</html>`;
}

// ── Email body (matches deposit-preview/HQ SendDepositModal exactly) ───────────

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
  publicLink: string,
): string {
  const depositPct =
    totalAmount > 0 ? Math.round((depositAmount / totalAmount) * 100) : 50;

  const itemSummary =
    lineItems && lineItems.length > 0
      ? `\n\nItems included:\n${lineItems.map((i) => `• ${i.name} (×${i.quantity})`).join("\n")}`
      : "";

  const hasTax = salesTaxAmount != null && salesTaxAmount > 0;
  const taxLine = hasTax
    ? `\nSales Tax (${fmtTaxRate(salesTaxRate)}): ${fmtCurrency(salesTaxAmount!)}`
    : "";
  const subtotalLine =
    subtotal != null && subtotal !== totalAmount
      ? `\nSubtotal: ${fmtCurrency(subtotal)}${taxLine}`
      : "";

  return (
    `Hi ${contactName},\n\n` +
    `Your project with Threefold Supply Co. is approved and ready to move into production!\n\n` +
    `To kick things off, we require a deposit as shown below.${itemSummary}\n\n` +
    `Deposit Request #: ${depositNumber ?? "[DEPOSIT NUMBER]"}${subtotalLine}\n` +
    `Total Project Value: ${fmtCurrency(totalAmount)}\n` +
    `Deposit Due (${depositPct}%): ${fmtCurrency(depositAmount)}\n` +
    `Balance Due on Completion: ${fmtCurrency(balanceRemaining)}\n\n` +
    `Please note: Card payments include a 3% processing fee. Bank account payments do not.\n\n` +
    `View your full deposit request here:\n${publicLink}\n\n` +
    `Once your deposit is received, we'll get started right away. Questions? Just reply to this email.\n\n` +
    `Best,`
  );
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { leadId, sender, confirm } = rawBody as Record<string, unknown>;

  // ── Hard confirmation gate ──────────────────────────────────────────────────
  if (confirm !== true) {
    return errResponse(
      "confirm must be boolean true. Show the full deposit preview and ask 'Send this deposit request?' before calling this endpoint.",
      400,
    );
  }

  // ── Input validation ────────────────────────────────────────────────────────
  if (!leadId || typeof leadId !== "string") {
    return errResponse(
      "leadId is required. Obtain it from GET /api/ai/deposit-preview.",
      400,
    );
  }

  if (!sender || typeof sender !== "string" || !VALID_SENDERS.has(sender)) {
    return errResponse("sender must be Alliyah, Hannah, or Jordan.", 400);
  }

  // ── Resend requirement ──────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  if (!resendKey) {
    return errResponse(
      "Email delivery requires RESEND_API_KEY. Use the HQ SendDepositModal to send this deposit request via Gmail.",
      503,
    );
  }

  try {
    const db = getSupabaseAdmin();

    // ── Fetch lead ──────────────────────────────────────────────────────────────
    const { data: leadRows, error: leadErr } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", leadId)
      .limit(1);

    if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/deposit-send] fetch lead: ${leadErr.message}`);
    }
    if (!leadRows || leadRows.length === 0) {
      return errResponse(
        "Lead not found. Obtain leadId from GET /api/ai/deposit-preview or GET /api/ai/crm.",
        404,
      );
    }

    const ld = (leadRows[0].data ?? {}) as Record<string, unknown>;
    const company = (ld.company as string) || (ld.name as string) || null;
    const clientEmail = (ld.email as string) || null;
    const existingHistory = (ld.communicationHistory as unknown[]) ?? [];

    if (!clientEmail) {
      return errResponse(
        "Lead has no email on file. Add an email in HQ before sending via Jarvis.",
        400,
      );
    }

    // ── Resolve deposit record ─────────────────────────────────────────────────
    const existingDepositId = (ld.deposit_request_id as string) || null;
    let depositId: string;
    let depositData: Record<string, unknown>;
    let isNew = false;

    if (existingDepositId) {
      // ── Reuse existing deposit — no new record, no new sequential number ───
      const { data: depRows, error: depErr } = await db
        .from("deposit_requests")
        .select("id,data")
        .eq("id", existingDepositId)
        .limit(1);

      if (depErr && (depErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/deposit-send] fetch deposit: ${depErr.message}`);
      }
      if (!depRows || depRows.length === 0) {
        return errResponse(
          `Deposit record ${existingDepositId} not found. Use GET /api/ai/deposit-preview to verify the deposit.`,
          404,
        );
      }

      depositId = depRows[0].id;
      depositData = (depRows[0].data ?? {}) as Record<string, unknown>;

      // Safety: block double-send
      const currentStatus = (depositData.status as string) ?? "draft";
      if (currentStatus === "sent") {
        const sentDate = (depositData.sent_date as string) ?? "a previous date";
        return errResponse(
          `This deposit request was already sent (${sentDate}). To resend, use the HQ SendDepositModal.`,
          409,
        );
      }
    } else {
      // ── No existing deposit — generate a new record ────────────────────────
      // Amounts come from the best sent quote for this lead, then fall back to
      // lead.value. Never recomputed — reads what is already stored.
      // Draft quotes are rejected; ambiguous sent quotes require the founder to
      // specify quoteNumber via GET /api/ai/quote-preview first.
      let totalAmount = 0;
      let lineItems: unknown[] | null = null;
      let subtotal: number | null = null;
      let salesTaxRate: number | null = null;
      let salesTaxAmount: number | null = null;
      let grandTotal: number | null = null;
      let quoteId: string | null = null;

      // Fetch all quotes for this lead and select the best one
      const { data: allQuoteRows, error: quotesErr } = await db
        .from("quotes")
        .select("id,data");

      if (quotesErr && (quotesErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/deposit-send] fetch quotes: ${quotesErr.message}`);
      }

      const leadQuotes = ((allQuoteRows ?? []) as QuoteRow[]).filter(
        (q) => (q.data?.lead_id as string) === leadId,
      );

      const quoteResult = selectBestQuote(leadQuotes);

      if (quoteResult.kind === "ambiguous") {
        const candidateList = quoteResult.candidates
          .map((c) => {
            const total = c.grandTotal != null ? fmtCurrency(c.grandTotal) : "no total";
            return `${c.quoteNumber ?? c.quoteId} (${c.status ?? "unknown"}, ${total})`;
          })
          .join("; ");
        return errResponse(
          `Multiple quotes exist for this lead — cannot determine which to use for the deposit. ` +
          `Preview the correct quote with GET /api/ai/quote-preview?quoteNumber=<number>, ` +
          `confirm with the founder, then retry. Candidates: ${candidateList}`,
          400,
        );
      }

      if (quoteResult.kind === "single") {
        const selectedQuote = quoteResult.quote;
        const qd = (selectedQuote.data ?? {}) as Record<string, unknown>;
        const quoteStatus = (qd.status as string) ?? null;

        if (quoteStatus !== "sent") {
          const qn = (qd.quote_number as string) ?? selectedQuote.id;
          return errResponse(
            `Quote ${qn} is a draft and has not been sent to the client. ` +
            `Send the quote first via HQ or GET /api/ai/quote-preview, then retry deposit-send.`,
            400,
          );
        }

        // Use the sent quote's amounts
        const qGrandTotal = qd.grand_total != null ? Number(qd.grand_total) : null;
        const qTotal = qd.total_amount != null ? Number(qd.total_amount) : 0;
        const effectiveTotal = qGrandTotal ?? qTotal;
        if (effectiveTotal > 0) {
          totalAmount = effectiveTotal;
          quoteId = selectedQuote.id;
          if (qd.subtotal != null) subtotal = Number(qd.subtotal);
          if (qd.sales_tax_rate != null) salesTaxRate = Number(qd.sales_tax_rate);
          if (qd.sales_tax_amount != null) salesTaxAmount = Number(qd.sales_tax_amount);
          if (qd.grand_total != null) grandTotal = Number(qd.grand_total);
          if (Array.isArray(qd.line_items)) lineItems = qd.line_items as unknown[];
        }
      }
      // quoteResult.kind === "empty" → falls through to lead.value

      // Fall back to lead value when no quote exists
      if (totalAmount <= 0) {
        const rawValue = ld.value;
        if (typeof rawValue === "number") {
          totalAmount = rawValue;
        } else if (typeof rawValue === "string") {
          const n = Number(String(rawValue).replace(/[^0-9.-]/g, ""));
          totalAmount = Number.isFinite(n) ? n : 0;
        }
        quoteId = null;
      }

      if (totalAmount <= 0) {
        return errResponse(
          "Lead has no project value or quote amount on file. Set the project value in HQ before sending via Jarvis.",
          400,
        );
      }

      const depositAmount = Math.round(totalAmount * 0.5 * 100) / 100;
      const balanceRemaining = Math.max(totalAmount - depositAmount, 0);

      // Sequential deposit request number (mirrors /api/deposit/generate exactly)
      const year = new Date().getFullYear();
      const { count } = await db
        .from("deposit_requests")
        .select("*", { count: "exact", head: true });
      const depositRequestNumber = `TF-D-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

      const token = "tfd-" + randomBytes(12).toString("hex");
      const publicLink = `${getPublicBaseUrl(new URL(request.url).origin)}/deposit/${token}`;

      depositId = `deposit-${leadId}-${Date.now()}`;

      const newDepositData: Record<string, unknown> = {
        id: depositId,
        deposit_request_number: depositRequestNumber,
        lead_id: leadId,
        quote_id: quoteId ?? null,
        client_name: company ?? "",
        client_email: clientEmail,
        total_amount: grandTotal ?? totalAmount,
        deposit_amount: depositAmount,
        balance_remaining: balanceRemaining,
        line_items: lineItems ?? null,
        payment_instructions: "",
        public_token: token,
        public_link: publicLink,
        status: "draft",
        notes: "",
        sent_date: null,
        email_status: null,
        email_message_id: null,
        created_at: new Date().toISOString(),
      };

      if (subtotal != null) newDepositData.subtotal = subtotal;
      if (salesTaxRate != null) newDepositData.sales_tax_rate = salesTaxRate;
      if (salesTaxAmount != null) newDepositData.sales_tax_amount = salesTaxAmount;
      if (grandTotal != null) newDepositData.grand_total = grandTotal;

      const { error: createErr } = await db
        .from("deposit_requests")
        .upsert({ id: depositId, data: newDepositData });

      if (createErr) {
        throw new Error(`[ai/deposit-send] create deposit: ${createErr.message}`);
      }

      depositData = newDepositData;
      isNew = true;
    }

    // ── Extract fields for email ────────────────────────────────────────────────
    const depositNumber = (depositData.deposit_request_number as string) ?? null;
    const publicLink = (depositData.public_link as string) || null;
    const totalAmount = (depositData.total_amount as number) ?? 0;
    const depositAmount = (depositData.deposit_amount as number) ?? 0;
    const balanceRemaining = (depositData.balance_remaining as number) ?? 0;
    const lineItems = (depositData.line_items as LineItem[] | null) ?? null;
    const subtotal = (depositData.subtotal as number | null) ?? null;
    const salesTaxRate = (depositData.sales_tax_rate as number | null) ?? null;
    const salesTaxAmount = (depositData.sales_tax_amount as number | null) ?? null;

    if (!publicLink) {
      return errResponse("Deposit record has no public link. Regenerate from HQ.", 400);
    }

    // ── Build email ─────────────────────────────────────────────────────────────
    const contactName = company ?? "there";
    const emailSubject = depositNumber
      ? `Your Deposit Request — ${depositNumber} | Threefold Supply Co.`
      : "Your Deposit Request | Threefold Supply Co.";

    const emailBodyText = buildEmailBody(
      contactName,
      depositNumber,
      totalAmount,
      depositAmount,
      balanceRemaining,
      lineItems,
      subtotal,
      salesTaxRate,
      salesTaxAmount,
      publicLink,
    );

    // ── Send via Resend ─────────────────────────────────────────────────────────
    let messageId: string | null = null;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Threefold Supply Co. <${fromEmail}>`,
        to: [clientEmail],
        subject: emailSubject,
        html: wrapInEmailTemplate(emailBodyText),
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text();
      console.error("[ai/deposit-send] Resend error:", resendError);
      return errResponse(
        "Email delivery failed. Try again or send from the HQ SendDepositModal.",
        502,
      );
    }

    const resendJson = (await resendRes.json()) as { id: string };
    messageId = resendJson.id;
    const sentAt = new Date().toISOString();

    // ── Update deposit record ───────────────────────────────────────────────────
    await db
      .from("deposit_requests")
      .update({
        data: {
          ...depositData,
          status: "sent",
          sent_date: sentAt,
          email_status: "sent",
          email_message_id: messageId,
        },
      })
      .eq("id", depositId);

    // ── Update lead record (mirrors handleDepositSent) ──────────────────────────
    const depositRequestNumber = depositNumber ?? depositId;
    const commEntry = {
      id: `comm-deposit-${Date.now()}`,
      type: "Email",
      date: businessTodayISO(),
      owner: sender,
      summary: `Deposit request sent by ${sender} via Jarvis. Request #${depositRequestNumber}. Portal: ${publicLink}`,
    };

    await db
      .from("crm_leads")
      .update({
        data: {
          ...ld,
          deposit_request_id: depositId,
          deposit_request_number: depositRequestNumber,
          communicationHistory: [commEntry, ...existingHistory],
        },
      })
      .eq("id", leadId);

    // ── Return ──────────────────────────────────────────────────────────────────
    return okResponse({
      sent: true,
      sentVia: "resend",
      isNew,
      depositId,
      depositNumber: depositRequestNumber,
      publicLink,
      leadId,
      company,
      sentAt,
      emailSubject,
    });
  } catch (err) {
    console.error("[ai/deposit-send POST]", err);
    return errResponse("Internal server error", 500);
  }
}
