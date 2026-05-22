"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Copy, Loader2, Send } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { openEmailCompose } from "@/lib/emailCompose";
import type { Lead } from "./types";

interface QuoteResult {
  quoteId: string;
  quoteNumber: string;
  publicLink: string;
  expirationDate: string;
}

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSent: (result: QuoteResult) => void;
}

type Step = "generating" | "preview" | "sending" | "sent" | "error";
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

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function SendQuoteModal({ open, lead, onClose, onSent }: Props) {
  const [step, setStep] = useState<Step>("generating");
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<CopyTarget | "">("");

  useEffect(() => {
    if (!open || !lead) return;

    setStep("generating");
    setQuoteResult(null);
    setErrorMsg("");
    setCopied("");
    setEmailTo(lead.email ?? "");

    const totalAmount = parseLeadValue(lead.value);
    const items: string[] = [lead.apparel_types].filter(Boolean) as string[];

    fetch("/api/quote/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        clientName: lead.company,
        clientEmail: lead.email,
        totalAmount,
        items,
        notes: lead.notes ?? "",
      }),
    })
      .then((r) => r.json())
      .then((data: QuoteResult & { error?: string }) => {
        if (data.error) {
          setStep("error");
          setErrorMsg(data.error);
          return;
        }

        setQuoteResult(data);

        const contactName = lead.contact || lead.company;
        const totalFormatted = fmtCurrency(totalAmount);
        const expFormatted = fmtDate(data.expirationDate);

        setEmailSubject(
          `Your Custom Quote — ${data.quoteNumber} | Threefold Supply Co.`,
        );
        setEmailBody(
          `Hi ${contactName},\n\nThank you for considering Threefold Supply Co.! We've put together a custom quote for your project.\n\nQuote Number: ${data.quoteNumber}\nProject Total: ${totalFormatted}\nValid Through: ${expFormatted}\n\nView your full quote here:\n${data.publicLink}\n\nThis quote is valid for 30 days. If you have any questions or are ready to move forward, just reply to this email.\n\nBest,`,
        );
        setStep("preview");
      })
      .catch((err: unknown) => {
        setStep("error");
        setErrorMsg(String(err));
      });
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!quoteResult) return;
    setStep("sending");

    try {
      openEmailCompose({ to: emailTo, subject: emailSubject, body: emailBody });

      setStep("sent");
      setTimeout(() => {
        onSent(quoteResult);
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
          Send Quote
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
          onClick={() => { setStep("generating"); }}
          className="min-h-11 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    ) : null;

  return (
    <ModalShell
      title="Send Quote"
      subtitle={`${lead.company} · ${lead.email}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      {step === "generating" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm text-slate-600">Generating quote...</p>
        </div>
      )}

      {step === "sending" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-900" />
          <p className="text-sm text-slate-600">Sending quote email...</p>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-slate-950">Quote Sent</p>
          <p className="text-sm text-slate-500">
            Lead moved to <strong>Quote Sent</strong>.
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-rose-700">
            Something went wrong
          </p>
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {step === "preview" && quoteResult && (
        <div className="flex flex-col gap-6">
          {/* Quote info strip */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Quote #
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {quoteResult.quoteNumber}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Expires
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {fmtDate(quoteResult.expirationDate)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Public link
              </p>
              <a
                href={quoteResult.publicLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-blue-600 underline"
              >
                {quoteResult.publicLink}
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
                  onClick={() => void copyToClipboard("link", quoteResult.publicLink)}
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
              <label className="text-xs font-semibold text-slate-600">
                Subject
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Message
              </label>
              <textarea
                rows={10}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              />
            </div>

            <p className="text-xs text-slate-400">
              Gmail compose opens in a new browser tab. If the tab is blocked, the mail app opens as a fallback.
            </p>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
