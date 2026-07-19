"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Send } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { supabase } from "@/lib/supabase";
import { calcDiscountAmount, normalizeDiscount } from "@/lib/salesTax";
import { buildReceiptEmail, resolveReceipt, fmtReceiptDate } from "@/lib/receipt";

// Loose shape — the full finances record is passed through so onSent can spread
// it back unchanged (preserving webhook-written keys) plus the receipt stamp.
export interface ReceiptInvoice {
  id: string;
  client?: string;
  client_name?: string;
  client_email?: string;
  orderName?: string;
  order_name?: string;
  subtotal?: number | null;
  discount?: unknown;
  sales_tax_rate?: number | null;
  sales_tax_amount?: number | null;
  grand_total?: number | null;
  [key: string]: unknown;
}

interface Props {
  open: boolean;
  invoice: ReceiptInvoice | null;
  // Lead email fallback (same source /api/invoice/generate uses) — shown in the
  // editable recipient field when the invoice has no client_email of its own.
  fallbackEmail?: string;
  // Contact person for the greeting; the email greets the person, company as fallback.
  fallbackContact?: string;
  // Deposit request number (e.g. TF-D-2026-0004) for the receipt reference line.
  depositNumber?: string;
  // Force which receipt phase to send. "deposit" resolves against a final_paid:false copy
  // (deposit phase + deposit_receipt_sent_at); undefined/"final" resolve the real invoice.
  // Steers phase only — the sent-stamp still lands on the real invoice's fields.
  forcePhase?: "deposit" | "final";
  onClose: () => void;
  onSent: (updated: ReceiptInvoice) => void;
}

type Step = "generating" | "preview" | "sending" | "sent" | "error";

export default function SendReceiptModal({ open, invoice, fallbackEmail, fallbackContact, depositNumber, forcePhase, onClose, onSent }: Props) {
  const resolvePhase = (inv: ReceiptInvoice) =>
    forcePhase === "deposit" ? resolveReceipt({ ...inv, final_paid: false }) : resolveReceipt(inv);
  const [step, setStep] = useState<Step>("generating");
  const [publicToken, setPublicToken] = useState("");
  const [publicLink, setPublicLink] = useState("");
  const [receiptToken, setReceiptToken] = useState("");
  const [receiptLink, setReceiptLink] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [sentVia, setSentVia] = useState<"gmail" | "resend" | "">("");

  const receipt = invoice ? resolvePhase(invoice) : null;
  const alreadySentAt = receipt ? (invoice?.[receipt.sentField] as string | undefined) : undefined;

  useEffect(() => {
    if (!open || !invoice) return;
    setStep("generating");
    setErrorMsg("");
    setSentVia("");
    // Prefill the visible recipient up front: invoice email, else lead fallback.
    setEmailTo((invoice.client_email || fallbackEmail || "").trim());

    const info = resolvePhase(invoice);
    if (!info) {
      setErrorMsg("Nothing is marked paid on this invoice yet.");
      setStep("error");
      return;
    }

    // Greet the contact person; fall back to company, then a neutral default.
    const clientName = (fallbackContact || "").trim() || invoice.client_name || invoice.client || "there";
    const orderName = invoice.order_name || invoice.orderName || "";
    const subtotal = invoice.subtotal ?? null;
    const discount = invoice.discount != null ? normalizeDiscount(invoice.discount) : null;
    const discountAmount = discount && subtotal != null ? calcDiscountAmount(subtotal, discount) : 0;

    fetch("/api/invoice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id }),
    })
      .then((r) => r.json())
      .then((d: { publicToken?: string; publicLink?: string; receiptToken?: string; receiptLink?: string; invoiceNumber?: string; clientEmail?: string; error?: string }) => {
        if (d.error || !d.publicLink) {
          setErrorMsg(d.error ?? "Failed to generate the receipt link.");
          setStep("error");
          return;
        }
        setPublicToken(d.publicToken ?? "");
        setPublicLink(d.publicLink);
        setReceiptToken(d.receiptToken ?? "");
        setReceiptLink(d.receiptLink ?? "");
        setInvoiceNumber(d.invoiceNumber ?? "");
        // Only fill from the server if the founder has not already got an address shown.
        setEmailTo((cur) => (cur.trim() ? cur : (d.clientEmail || "")));

        const { subject, body } = buildReceiptEmail({
          clientName,
          receipt: info,
          orderName,
          // Receipt email links to the STABLE receipt link (r- token), never the tfi- bill.
          publicLink: d.receiptLink ?? d.publicLink,
          subtotal,
          discountLabel: discount?.label ?? null,
          discountAmount,
          salesTaxRate: invoice.sales_tax_rate ?? null,
          salesTaxAmount: invoice.sales_tax_amount ?? null,
          grandTotal: invoice.grand_total ?? null,
          depositNumber: (depositNumber || "").trim() || null,
        });
        setEmailSubject(subject);
        setEmailBody(body);
        setStep("preview");
      })
      .catch((err: unknown) => {
        setErrorMsg(String(err));
        setStep("error");
      });
  }, [open, invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!invoice || !receipt) return;
    if (!emailTo.trim()) {
      setErrorMsg("A client email is required to send a receipt.");
      setStep("error");
      return;
    }
    setStep("sending");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // recordId empty => send-email does not mutate any record; we stamp the
        // finances record ourselves via onSent below.
        body: JSON.stringify({ to: emailTo, subject: emailSubject, body: emailBody, recordId: "", recordType: "quote" }),
      });
      const data = (await res.json()) as { sent?: boolean; error?: string; sentVia?: "gmail" | "resend" };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setSentVia(data.sentVia ?? "");

      const stampedAt = new Date().toISOString();
      // If the address came from the fallback (invoice had no client_email), persist
      // the one we actually sent to so the record stops being empty.
      const hadInvoiceEmail = ((invoice.client_email as string) || "").trim().length > 0;
      const updated: ReceiptInvoice = {
        ...invoice,
        ...(publicToken ? { public_token: publicToken, public_link: publicLink } : {}),
        // Carry through the receipt token too, so this stamp write never wipes the r- token
        // that /api/invoice/generate just minted (mirrors the public_token preservation).
        ...(receiptToken ? { receipt_public_token: receiptToken, receipt_public_link: receiptLink } : {}),
        // Carry the server-minted final-invoice number through too, so the stamp write never
        // wipes it (mirrors the token preservation above).
        ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
        ...(!hadInvoiceEmail && emailTo.trim() ? { client_email: emailTo.trim() } : {}),
        [receipt.sentField]: stampedAt,
      };
      onSent(updated);

      const clientName = invoice.client_name || invoice.client || "";
      void supabase.auth.getSession().then(({ data: { session } }) =>
        fetch("/api/internal/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            type: "receipt_sent",
            title: receipt.paidInFull ? "Receipt Sent" : "Deposit Receipt Sent",
            message: `${clientName} · ${receipt.markLabel} receipt sent.`,
            entity_type: "finance",
            entity_id: invoice.id,
          }),
        }).catch((err) => console.error("[notify]", err)),
      );

      setStep("sent");
      window.setTimeout(onClose, 2000);
    } catch (err: unknown) {
      setErrorMsg(String(err));
      setStep("error");
    }
  };

  if (!open || !invoice) return null;

  const clientName = invoice.client_name || invoice.client || "";
  const projectName = invoice.order_name || invoice.orderName || "";

  const footer =
    step === "preview" ? (
      <div className="flex flex-col gap-3">
        {!emailTo.trim() && (
          <p className="text-xs font-semibold text-rose-600">
            No email on file for this client. Enter a recipient above to send.
          </p>
        )}
        {alreadySentAt && (
          <p className="text-xs font-semibold text-amber-700">
            A {receipt?.paidInFull ? "" : "deposit "}receipt was already sent on {fmtReceiptDate(alreadySentAt)}. Sending again delivers a duplicate.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!emailTo.trim()}
            className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <Send size={14} />
            {alreadySentAt ? "Resend Receipt" : "Send Receipt"}
          </button>
        </div>
      </div>
    ) : step === "error" ? (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    ) : null;

  return (
    <ModalShell
      title="Send Receipt"
      subtitle={`${clientName}${projectName ? ` · ${projectName}` : ""}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      {(step === "generating" || step === "sending") && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm text-slate-600">
            {step === "generating" ? "Preparing receipt..." : "Sending receipt..."}
          </p>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-slate-950">Receipt Sent</p>
          {sentVia && (
            <p className="text-xs text-slate-400">Sent via {sentVia === "gmail" ? "Gmail API" : "Resend"}</p>
          )}
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">To</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
              placeholder="client@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Message (edit before sending)</label>
            <textarea
              rows={16}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
        </div>
      )}
    </ModalShell>
  );
}
