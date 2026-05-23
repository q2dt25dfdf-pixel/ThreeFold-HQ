"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Copy, Loader2, Send } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { openEmailCompose } from "@/lib/emailCompose";
import { parseAmount } from "@/lib/invoiceCalc";

interface Invoice {
  id: string;
  client: string;
  client_name?: string;
  client_email?: string;
  orderName: string;
  order_name?: string;
  balance_remaining: string | number;
}

interface Props {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
}

type Step = "generating" | "preview" | "sending" | "sent" | "error";
type CopyTarget = "subject" | "body" | "link";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function SendFinalInvoiceModal({ open, invoice, onClose }: Props) {
  const [step, setStep] = useState<Step>("generating");
  const [publicLink, setPublicLink] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<CopyTarget | "">("");

  useEffect(() => {
    if (!open || !invoice) return;
    setStep("generating");
    setPublicLink("");
    setErrorMsg("");
    setCopied("");

    const clientName = invoice.client_name || invoice.client || "there";
    const projectName = invoice.order_name || invoice.orderName || "your order";

    fetch("/api/invoice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id }),
    })
      .then((r) => r.json())
      .then((d: { publicLink?: string; clientEmail?: string; balanceRemaining?: number; error?: string }) => {
        if (d.error || !d.publicLink) {
          setErrorMsg(d.error ?? "Failed to generate invoice link.");
          setStep("error");
          return;
        }
        // Use API-returned email as primary; fall back to invoice prop
        const bestEmail = d.clientEmail || invoice.client_email || "";
        setEmailTo(bestEmail);
        setPublicLink(d.publicLink);
        // Use API-returned balance (cross-referenced with deposit request) for accuracy
        const balance = d.balanceRemaining ?? parseAmount(invoice.balance_remaining);
        setEmailSubject(`Final Invoice – ${projectName}`);
        setEmailBody(
          `Hello ${clientName},\n\nYour order is complete and the remaining balance is now ready for payment.\n\nRemaining Balance:\n${fmtCurrency(balance)}\n\nView and pay your invoice here:\n${d.publicLink}\n\nPlease note:\nCard payments include a 3% processing fee.\nBank account payments do not.\n\nIf you have any questions, please reply to this email.\n\nBest,\nThreeFold Supply Co.`,
        );
        setStep("preview");
      })
      .catch((err: unknown) => {
        setErrorMsg(String(err));
        setStep("error");
      });
  }, [open, invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    setStep("sending");
    try {
      openEmailCompose({ to: emailTo, subject: emailSubject, body: emailBody });
      setStep("sent");
      if (invoice) {
        const clientName = invoice.client_name || invoice.client || "";
        fetch('/api/internal/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'final_invoice_sent',
            title: 'Final Invoice Sent',
            message: `${clientName} · Final invoice delivered.`,
            entity_type: 'finance',
            entity_id: invoice.id,
          }),
        }).catch(err => console.error('[notify]', err));
      }
      window.setTimeout(onClose, 2000);
    } catch (err: unknown) {
      setErrorMsg(String(err));
      setStep("error");
    }
  };

  const copyToClipboard = async (target: CopyTarget, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(""), 1800);
  };

  if (!open || !invoice) return null;

  const footer =
    step === "preview" ? (
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
          onClick={handleSend}
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Send size={14} />
          Send Final Invoice
        </button>
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

  const clientName = invoice.client_name || invoice.client || "";
  const projectName = invoice.order_name || invoice.orderName || "";

  return (
    <ModalShell
      title="Send Final Invoice"
      subtitle={`${clientName}${projectName ? ` · ${projectName}` : ""}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      {(step === "generating" || step === "sending") && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm text-slate-600">
            {step === "generating" ? "Generating invoice link..." : "Opening email..."}
          </p>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-slate-950">Final Invoice Sent</p>
          <p className="text-sm text-slate-500">
            Mark the invoice as <strong>Final Paid</strong> once the balance is received.
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-6">
          {/* Balance + link strip */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Balance Due
              </p>
              <p className="mt-1 text-sm font-semibold text-amber-700">
                {fmtCurrency(parseAmount(invoice.balance_remaining))}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Public Link
              </p>
              <a
                href={publicLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-blue-600 underline"
              >
                {publicLink}
              </a>
            </div>
          </div>

          {/* Email preview */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Email Preview — edit before sending
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyToClipboard("subject", emailSubject)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied === "subject" ? "Copied" : "Copy Subject"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyToClipboard("body", emailBody)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied === "body" ? "Copied" : "Copy Body"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyToClipboard("link", publicLink)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied === "link" ? "Copied" : "Copy Link"}
                </button>
              </div>
            </div>

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
              <label className="text-xs font-semibold text-slate-600">Message</label>
              <textarea
                rows={14}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              />
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
