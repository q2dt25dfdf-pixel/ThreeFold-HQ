"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Copy, Loader2, Send } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { openEmailCompose } from "@/lib/emailCompose";
import type { Lead, QuoteItem } from "./types";

interface DepositResult {
  depositRequestId: string;
  depositRequestNumber: string;
  publicLink: string;
  totalAmount: number;
  depositAmount: number;
  balanceRemaining: number;
}

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSent: (result: DepositResult) => void;
}

type QuoteSnapshot = {
  quoteId: string;
  quoteNumber: string;
  lineItems: QuoteItem[];
  totalAmount: number;
};

type Step = "configure" | "generating" | "preview" | "sending" | "sent" | "error";
type CopyTarget = "subject" | "body" | "link";

function parseLeadValue(value: Lead["value"]): number {
  if (typeof value === "number") return value;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function SendDepositModal({ open, lead, onClose, onSent }: Props) {
  const [step, setStep] = useState<Step>("configure");
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const [quoteData, setQuoteData] = useState<QuoteSnapshot | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const rawTotal = parseLeadValue(lead?.value ?? 0);
  const [totalAmount, setTotalAmount] = useState(rawTotal);
  const [depositPercent, setDepositPercent] = useState(50);
  const depositAmount = Math.round((totalAmount * depositPercent) / 100 * 100) / 100;
  const balanceRemaining = Math.max(totalAmount - depositAmount, 0);

  const [paymentInstructions, setPaymentInstructions] = useState(
    "Please send your deposit via Venmo, Zelle, or check made payable to Threefold Supply Co.",
  );
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<CopyTarget | "">("");

  const depositFieldsInvalid =
    quoteLoading ||
    !Number.isFinite(totalAmount) ||
    totalAmount <= 0 ||
    !Number.isFinite(depositPercent) ||
    depositPercent <= 0 ||
    depositPercent > 100;

  useEffect(() => {
    if (!open || !lead) return;
    setStep("configure");
    setDepositResult(null);
    setErrorMsg("");
    setCopied("");
    setEmailTo(lead.email ?? "");
    setTotalAmount(parseLeadValue(lead.value));
    setDepositPercent(50);
    setQuoteData(null);
    setQuoteLoading(false);

    if (lead.quote_id) {
      setQuoteLoading(true);
      fetch(`/api/quote/by-id?id=${encodeURIComponent(lead.quote_id)}`)
        .then((r) => r.json())
        .then((d: { quoteId?: string; quoteNumber?: string; lineItems?: QuoteItem[] | null; totalAmount?: number; error?: string }) => {
          if (!d.error && d.lineItems && d.lineItems.length > 0 && d.quoteId && d.quoteNumber && d.totalAmount != null) {
            setQuoteData({
              quoteId: d.quoteId,
              quoteNumber: d.quoteNumber,
              lineItems: d.lineItems,
              totalAmount: d.totalAmount,
            });
            setTotalAmount(d.totalAmount);
          }
        })
        .catch(() => { /* silently fall back to lead value */ })
        .finally(() => setQuoteLoading(false));
    }
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!lead) return;
    setStep("generating");

    try {
      const res = await fetch("/api/deposit/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          quoteId: quoteData?.quoteId ?? lead.quote_id ?? null,
          clientName: lead.company,
          clientEmail: lead.email,
          totalAmount,
          depositAmount,
          lineItems: quoteData?.lineItems ?? null,
          paymentInstructions,
          notes: "",
        }),
      });

      const data = (await res.json()) as DepositResult & { error?: string };

      if (data.error) {
        setStep("error");
        setErrorMsg(data.error);
        return;
      }

      setDepositResult(data);

      const contactName = lead.contact || lead.company;
      const itemSummary = quoteData
        ? `\n\nItems included:\n${quoteData.lineItems.map((i) => `• ${i.name} (×${i.quantity})`).join("\n")}`
        : "";

      setEmailSubject(`Your Deposit Request — ${data.depositRequestNumber} | Threefold Supply Co.`);
      setEmailBody(
        `Hi ${contactName},\n\nYour project with Threefold Supply Co. is approved and ready to move into production!\n\nTo kick things off, we require a deposit as shown below.${itemSummary}\n\nDeposit Request #: ${data.depositRequestNumber}\nTotal Project Value: ${fmtCurrency(data.totalAmount)}\nDeposit Due (${depositPercent}%): ${fmtCurrency(data.depositAmount)}\nBalance Due on Completion: ${fmtCurrency(data.balanceRemaining)}\n\nView your full deposit request here:\n${data.publicLink}\n\n${paymentInstructions}\n\nOnce your deposit is received, we'll get started right away. Questions? Just reply to this email.\n\nBest,`,
      );
      setStep("preview");
    } catch (err: unknown) {
      setStep("error");
      setErrorMsg(String(err));
    }
  };

  const handleSend = async () => {
    if (!depositResult) return;
    setStep("sending");
    try {
      openEmailCompose({ to: emailTo, subject: emailSubject, body: emailBody });
      setStep("sent");
      setTimeout(() => {
        onSent(depositResult);
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setStep("error");
      setErrorMsg(String(err));
    }
  };

  const copyToClipboard = async (target: CopyTarget, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(""), 1800);
  };

  if (!open || !lead) return null;

  const footer =
    step === "configure" ? (
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
          onClick={() => void handleGenerate()}
          disabled={depositFieldsInvalid}
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send Email
        </button>
      </div>
    ) : step === "preview" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep("configure")}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => void handleSend()}
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Send size={14} />
          Send Deposit Request
        </button>
      </div>
    ) : step === "error" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => setStep("configure")}
          className="min-h-11 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Try Again
        </button>
      </div>
    ) : null;

  return (
    <ModalShell
      title="Send Deposit Request"
      subtitle={`${lead.company} · ${lead.email}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      {step === "generating" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm text-slate-600">Generating deposit request...</p>
        </div>
      )}

      {step === "sending" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-900" />
          <p className="text-sm text-slate-600">Sending email...</p>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-slate-950">Deposit Request Sent</p>
          <p className="text-sm text-slate-500">
            When the deposit is received, move the lead to <strong>Deposit Paid</strong> to create the order automatically.
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {step === "configure" && (
        <div className="flex flex-col gap-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Deposit Details
          </p>

          {/* Quote items summary — only shown when a quote with line_items is found */}
          {quoteLoading && (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              <span className="text-xs text-slate-500">Checking for saved quote...</span>
            </div>
          )}

          {quoteData && !quoteLoading && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Sourced from Quote
                </p>
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {quoteData.quoteNumber}
                </span>
              </div>
              <div className="space-y-3">
                {quoteData.lineItems.map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-950">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        ×{item.quantity} @ {fmtCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-slate-950">
                      {fmtCurrency(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Quote Total
                </span>
                <span className="font-bold text-slate-950">{fmtCurrency(quoteData.totalAmount)}</span>
              </div>
            </div>
          )}

          {/* Amount fields */}
          <div className={`grid gap-4 ${quoteData ? "" : "sm:grid-cols-2"}`}>
            {/* Total amount — editable only when no quote is linked */}
            {!quoteData && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Total Project Value</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Deposit Percentage</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Math.min(100, Math.max(1, Number(e.target.value))))}
                  className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-4 pr-8 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Deposit Due
              </p>
              <p className="mt-1 text-base font-bold text-slate-950">{fmtCurrency(depositAmount)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Balance Later
              </p>
              <p className="mt-1 text-base font-bold text-slate-950">{fmtCurrency(balanceRemaining)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Total</p>
              <p className="mt-1 text-base font-bold text-slate-950">{fmtCurrency(totalAmount)}</p>
            </div>
          </div>

          {/* Payment instructions */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Payment Instructions</label>
            <textarea
              rows={3}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              placeholder="How should the client pay? Venmo, Zelle, check..."
            />
          </div>
        </div>
      )}

      {step === "preview" && depositResult && (
        <div className="flex flex-col gap-6">
          {/* Deposit info strip */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Request #
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {depositResult.depositRequestNumber}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Deposit Due
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {fmtCurrency(depositResult.depositAmount)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Public link
              </p>
              <a
                href={depositResult.publicLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-blue-600 underline"
              >
                {depositResult.publicLink}
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
                  onClick={() => void copyToClipboard("link", depositResult.publicLink)}
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
                rows={12}
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
