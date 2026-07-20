import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReceiptEmail, chooseReceiptEmailLink, resolveReceipt, type ReceiptSource } from "@/lib/receipt";
import { calcDiscountAmount, normalizeDiscount } from "@/lib/salesTax";
import { nextSequenceNumber } from "@/lib/sequenceNumber";
import { sendEmail } from "@/lib/sendEmail";

// Server-side auto-send of the client receipt the moment a payment is real. ONE function,
// used directly by the Stripe webhook and (via /api/invoice/auto-receipt) by the founder path.
//
// Wording is IDENTICAL to the manual send (same buildReceiptEmail), link is chosen by the same
// chooseReceiptEmailLink router, and it dedupes on the phase's receipt-sent stamp so it can
// never double-send with a manual send or re-fire on a Stripe webhook retry.
//
// NEVER throws: every path returns a status string and logs failures. Callers fire-and-forget
// AFTER the money write, so a failed email can never affect payment.

type Row = Record<string, unknown>;

async function leadContactAndEmail(
  db: SupabaseClient,
  leadId: string,
): Promise<{ contact: string; email: string }> {
  const { data } = await db.from("crm_leads").select("data").eq("id", leadId).limit(1);
  const ld = (data?.[0]?.data ?? {}) as Row;
  return { contact: String(ld.contact ?? "").trim(), email: String(ld.email ?? "").trim() };
}

// Mint the tfi-/r- links + TF-I- number if the row lacks them, persisting via the merge RPC
// (never a whole-blob write, so activity_log is preserved). Only mints when baseUrl is absolute;
// otherwise returns whatever links already exist (auto-send is skipped if none resolve).
async function ensureLinks(
  db: SupabaseClient,
  invoiceId: string,
  row: Row,
  baseUrl: string,
): Promise<{ publicLink: string; receiptLink: string; invoiceNumber: string }> {
  let publicToken = typeof row.public_token === "string" ? row.public_token : "";
  let publicLink = typeof row.public_link === "string" ? row.public_link : "";
  let receiptToken = typeof row.receipt_public_token === "string" ? row.receipt_public_token : "";
  let receiptLink = typeof row.receipt_public_link === "string" ? row.receipt_public_link : "";
  let invoiceNumber = typeof row.invoice_number === "string" ? row.invoice_number : "";

  const base = (baseUrl || "").replace(/\/+$/, "");
  const fields: Row = {};
  if (base) {
    if (!publicToken) {
      publicToken = "tfi-" + randomBytes(12).toString("hex");
      publicLink = `${base}/invoice/${publicToken}`;
      fields.public_token = publicToken;
      fields.public_link = publicLink;
    }
    if (!receiptToken) {
      receiptToken = "r-" + randomBytes(12).toString("hex");
      receiptLink = `${base}/invoice/${receiptToken}`;
      fields.receipt_public_token = receiptToken;
      fields.receipt_public_link = receiptLink;
    }
    if (!invoiceNumber) {
      invoiceNumber = await nextSequenceNumber(db, { table: "finances", field: "invoice_number", prefix: "TF-I" });
      fields.invoice_number = invoiceNumber;
    }
    if (Object.keys(fields).length > 0) {
      await db.rpc("update_finances_fields", { p_id: invoiceId, p_fields: fields });
    }
  }
  return { publicLink, receiptLink, invoiceNumber };
}

async function resolveDepositNumber(db: SupabaseClient, row: Row): Promise<string> {
  const onRow = String(row.deposit_request_number ?? "").trim();
  if (onRow) return onRow;
  const depId = String(row.deposit_request_id ?? "").trim();
  if (!depId) return "";
  const { data } = await db.from("deposit_requests").select("data").eq("id", depId).limit(1);
  return String((data?.[0]?.data as Row | undefined)?.deposit_request_number ?? "").trim();
}

export async function autoSendReceipt(
  db: SupabaseClient,
  invoiceId: string,
  baseUrl: string,
  fallbackEmail?: string,
): Promise<{ status: string }> {
  try {
    const { data: rows } = await db.from("finances").select("id,data").eq("id", invoiceId).limit(1);
    const row = rows?.[0]?.data as Row | undefined;
    if (!row) return { status: "no-row" };

    const info = resolveReceipt(row as ReceiptSource);
    if (!info) return { status: "nothing-paid" };

    // DEDUPE: if this phase's receipt was already sent (auto or manual), do nothing.
    const stamp = row[info.sentField];
    if (typeof stamp === "string" && stamp.trim()) return { status: "already-sent" };

    // Resolve recipient: row email, else caller fallback, else the linked lead's email.
    let to = String(row.client_email ?? "").trim() || String(fallbackEmail ?? "").trim();
    const leadId = String(row.lead_id ?? "").trim();
    let leadContact = "";
    if (leadId) {
      const lead = await leadContactAndEmail(db, leadId);
      leadContact = lead.contact;
      if (!to) to = lead.email;
    }
    if (!to) {
      console.warn("[autoSendReceipt] no client email; skipping", invoiceId);
      return { status: "no-email" };
    }

    const { publicLink, receiptLink, invoiceNumber } = await ensureLinks(db, invoiceId, row, baseUrl);
    const link = chooseReceiptEmailLink(info.paidInFull, publicLink, receiptLink);
    if (!link) {
      console.warn("[autoSendReceipt] no receipt link resolvable; skipping", invoiceId);
      return { status: "no-link" };
    }

    const depositNumber = await resolveDepositNumber(db, row);
    // Greet the person: lead contact, else company/client name, else neutral.
    const clientName = leadContact || String(row.client_name ?? row.client ?? "").trim() || "there";

    const discount = row.discount != null ? normalizeDiscount(row.discount) : null;
    const subtotal = row.subtotal != null ? Number(row.subtotal) : null;
    const discountAmount = discount && subtotal != null ? calcDiscountAmount(subtotal, discount) : 0;

    const { subject, body } = buildReceiptEmail({
      clientName,
      receipt: info,
      orderName: String(row.order_name ?? row.orderName ?? "") || null,
      publicLink: link,
      subtotal,
      discountLabel: discount?.label ?? null,
      discountAmount,
      salesTaxRate: row.sales_tax_rate != null ? Number(row.sales_tax_rate) : null,
      salesTaxAmount: row.sales_tax_amount != null ? Number(row.sales_tax_amount) : null,
      grandTotal: row.grand_total != null ? Number(row.grand_total) : null,
      depositNumber: depositNumber || null,
      invoiceNumber: invoiceNumber || null,
    });

    const result = await sendEmail({ to, subject, body });
    if (!result.sent) {
      console.error("[autoSendReceipt] send failed", invoiceId, result.error);
      return { status: "send-failed" };
    }

    // Stamp the phase's sent field via the merge RPC (preserves activity_log). This makes the
    // manual UI show "Resend" and prevents any re-fire.
    await db.rpc("update_finances_fields", { p_id: invoiceId, p_fields: { [info.sentField]: new Date().toISOString() } });
    return { status: "sent" };
  } catch (err) {
    // Swallow everything: a receipt failure must never affect the payment that triggered it.
    console.error("[autoSendReceipt] error", invoiceId, err);
    return { status: "error" };
  }
}
