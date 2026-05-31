import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { parseAmount } from "@/lib/invoiceCalc";
import { POST as generateToken } from "@/app/api/invoice/generate/route";

export const dynamic = "force-dynamic";

// ── POST /api/ai/invoice-action/prepare-final-send ─────────────────────────
//
// Jarvis action: prepares compose-ready data for the final invoice send.
// Calls /api/invoice/generate idempotently to ensure a public link exists.
//
// Requires:
//   - confirm: true in body (explicit founder confirmation)
//   - deposit_paid === true on the finance record
//   - final_paid !== true (prevents double-payment confusion)
//   - invoice not cancelled or draft
//
// Does NOT:
//   - Send any email
//   - Create a Stripe checkout session
//   - Mark final_paid or update any finance status
//   - Return client_email, public_token, or stripe_invoice_url

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function deriveInvoicePhase(raw: Record<string, unknown>): string {
  if (raw.final_paid === true) return "paid_in_full";
  const status = String(raw.status ?? "").toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (status === "draft") return "draft";
  if (raw.deposit_paid === true) return "final_payment_due";
  return "deposit_phase";
}

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
    `Best,\nThreeFold Supply Co.`
  );
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

  const { invoiceId, confirm } = body as Record<string, unknown>;

  if (!invoiceId || typeof invoiceId !== "string") {
    return errResponse("invoiceId is required", 400);
  }
  if (confirm !== true) {
    return errResponse(
      "confirm: true is required. First call GET /api/ai/invoice-preview to review the invoice, then set confirm: true.",
      400,
    );
  }

  try {
    const db = getSupabaseAdmin();

    const { data: rows, error } = await db
      .from("finances")
      .select("id,data")
      .eq("id", invoiceId)
      .limit(1);

    if (error && (error as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/prepare-final-send] fetch invoice: ${error.message}`);
    }
    if (!rows || rows.length === 0) {
      return errResponse(`No invoice found with id "${invoiceId}".`, 404);
    }

    const raw = ((rows[0] as { id: string; data: Record<string, unknown> | null }).data ?? {}) as Record<string, unknown>;

    // ── Phase validation ────────────────────────────────────────────────────────

    const phase = deriveInvoicePhase(raw);

    if (phase === "paid_in_full") {
      return errResponse("Invoice is already paid in full — no final send needed.", 409);
    }
    if (phase === "cancelled") {
      return errResponse("Invoice is cancelled — cannot prepare final send.", 409);
    }
    if (phase === "draft") {
      return errResponse("Invoice is in draft — cannot prepare final send.", 409);
    }
    if (phase !== "final_payment_due") {
      // deposit_phase — deposit has not been collected yet
      return errResponse(
        "Deposit has not been paid yet. Final invoice can only be prepared after the deposit is collected.",
        409,
      );
    }

    // ── Call generate idempotently ──────────────────────────────────────────────
    // If public_token already exists on the record this returns immediately
    // without any database write — safe to call on every prepare.

    const origin = new URL(request.url).origin;
    const genReq = new NextRequest(`${origin}/api/invoice/generate`, {
      method: "POST",
      body: JSON.stringify({ invoiceId }),
      headers: { "Content-Type": "application/json" },
    });

    const genRes = await generateToken(genReq);

    if (!genRes.ok) {
      const genBody = await genRes.json() as { error?: string };
      return errResponse(
        `Invoice link could not be generated: ${genBody.error ?? "unknown error"}`,
        502,
      );
    }

    const genBody = await genRes.json() as {
      publicToken?: string;
      publicLink?: string;
      clientEmail?: string;
      balanceRemaining?: number;
    };

    // publicToken and clientEmail are intentionally discarded — never returned
    const publicLink = genBody.publicLink ?? null;
    const balanceRemaining =
      typeof genBody.balanceRemaining === "number"
        ? genBody.balanceRemaining
        : Math.max(
            parseAmount(raw.total_amount ?? raw.amount) - parseAmount(raw.deposit_amount),
            0,
          );

    // ── Build compose-ready data ────────────────────────────────────────────────

    const company   = (raw.client_name as string) || (raw.client as string) || null;
    const orderName = (raw.order_name as string) || (raw.orderName as string) || null;
    const leadId    = (raw.lead_id as string) || null;
    const status    = (raw.status as string) || "Active";
    const depositPaidDate = (raw.deposit_paid_date as string) || null;
    const finalDueDate    = (raw.final_due_date as string) || (raw.dueDate as string) || null;

    const clientName  = company ?? "there";
    const projectName = orderName ?? "your order";
    const emailSubject      = `Final Invoice – ${projectName}`;
    const emailBodyPreview  = buildEmailBody(clientName, projectName, balanceRemaining, publicLink);

    const verificationSummary = [
      `Invoice ${invoiceId}`,
      company   ? ` for ${company}`   : "",
      orderName ? ` · ${orderName}`   : "",
      ` — status: ${status}, phase: ${phase}`,
      `, balance: ${fmtCurrency(balanceRemaining)}`,
      publicLink ? ". Invoice link ready." : ". No invoice link generated.",
    ].join("");

    return okResponse({
      invoiceId,
      invoicePhase:   phase,
      company,
      orderName,
      leadId,
      status,
      depositPaidDate,
      finalDueDate,
      balanceRemaining: Math.round(balanceRemaining * 100) / 100,
      publicLink,
      emailSubject,
      emailBodyPreview,
      verificationSummary,
      nextStep:
        "Review the email preview above. When ready, open your email client or HQ to send. " +
        "This endpoint does not send email — the founder must send manually.",
      preparedVia: "jarvis",
    });
  } catch (err) {
    console.error("[ai/invoice-action/prepare-final-send POST]", err);
    return errResponse("Internal server error", 500);
  }
}
