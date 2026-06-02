"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Copy, Loader2, Plus, Send, X } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import SenderPicker, { type Sender } from "@/components/SenderPicker";
import { openGmailDraftOrFallback } from "@/lib/emailCompose";
import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";
import { calcGrandTotal, calcSalesTax, fmtTaxRate, salesTaxRate } from "@/lib/salesTax";
import type { Lead, QuoteItem } from "./types";

interface QuoteResult {
  quoteId: string;
  quoteNumber: string;
  publicLink: string;
  expirationDate: string;
  grandTotal?: number;
  salesTaxRate?: number;
  salesTaxAmount?: number;
  taxJurisdictionLabel?: string;
  taxRateWarning?: string | null;
}

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSent: (result: QuoteResult, sender: string) => void;
}

type Step = "details" | "generating" | "preview" | "sending" | "sent" | "error";
type CopyTarget = "subject" | "body" | "link";

const QUOTE_ITEM_PRESETS = [
  {
    name: "Custom Performance Dri-Fit Tee",
    description:
      "Premium moisture-wicking performance apparel custom designed around your company's identity, culture, and team. Includes original artwork, mockups, revisions, and production-ready graphics.",
    unitPrice: 40,
  },
] as const;

function newItem(): QuoteItem {
  return { name: "", description: "", quantity: 1, unitPrice: 0, lineTotal: 0 };
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
  const [step, setStep] = useState<Step>("details");
  const [lineItems, setLineItems] = useState<QuoteItem[]>([newItem()]);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<CopyTarget | "">("");
  const [sender, setSender] = useState<Sender | "">("");

  useEffect(() => {
    if (!open || !lead) return;
    setStep("details");
    setLineItems([newItem()]);
    setQuoteResult(null);
    setErrorMsg("");
    setCopied("");
    setSender("");
    setEmailTo(lead.email ?? "");
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateItem = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        updated.lineTotal = updated.quantity * updated.unitPrice;
        return updated;
      }),
    );
  };

  // Selects a preset item name and auto-fills its description.
  // Manual edits to description afterwards are independent of this.
  const selectPresetItem = (idx: number, name: string) => {
    const preset = QUOTE_ITEM_PRESETS.find((p) => p.name === name);
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = {
          ...item,
          name,
          ...(preset ? { description: preset.description, unitPrice: preset.unitPrice, originalUnitPrice: preset.unitPrice } : {}),
        };
        updated.lineTotal = updated.quantity * updated.unitPrice;
        return updated;
      }),
    );
  };

  const addItem = () => setLineItems((prev) => [...prev, newItem()]);
  const removeItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));

  const subTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxRate = salesTaxRate();
  const salesTaxAmount = calcSalesTax(subTotal, taxRate);
  const grandTotal = calcGrandTotal(subTotal, taxRate);
  const hasValidItems = lineItems.some((i) => i.name.trim() && i.quantity > 0);

  const handlePreviewEmail = () => {
    if (!lead || !hasValidItems) return;

    const validItems = lineItems.filter((i) => i.name.trim());
    const computedSubtotal = validItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const computedTax = calcSalesTax(computedSubtotal, taxRate);
    const computedGrandTotal = computedSubtotal + computedTax;

    setStep("generating");

    fetch("/api/quote/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        clientName: lead.company,
        clientEmail: lead.email,
        clientAddressText: lead.companyProfile?.address ?? "",
        subtotal: computedSubtotal,
        totalAmount: computedGrandTotal,
        lineItems: validItems,
        items: validItems.map((i) => i.name),
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

        const serverGrandTotal = data.grandTotal ?? computedGrandTotal;
        setQuoteResult({ ...data, grandTotal: serverGrandTotal });

        const contactName = lead.contact || lead.company;
        const grandTotalFormatted = fmtCurrency(serverGrandTotal);
        const expFormatted = fmtDate(data.expirationDate);
        const isRevised = lead.stage === "Quote Sent";

        const sharedTail = `This quote is valid for 30 days.\n\nTo move forward, we require a 50% deposit before production begins. The remaining 50% balance is due before the completed order is delivered or shipped.\n\nIf everything looks good, simply reply to this email, give us a call, or send us a text. We'll prepare and send your deposit invoice separately and get your project into production.\n\nIf you have any questions at all, please don't hesitate to reach out.\n\n${TF_PLAIN_CLOSING}`;

        if (isRevised) {
          setEmailSubject(`Updated Quote from Threefold Supply Co.`);
          setEmailBody(
            `Hello ${contactName},\n\nWe've updated your quote based on the changes discussed and attached the revised pricing for your review.\n\nYou can view your updated quote and pricing breakdown here:\n${data.publicLink}\n\nPlease take a look and let us know if everything looks correct. If you'd like to make any additional adjustments, simply reply to this email and we'll be happy to update it further.\n\nOnce you're ready to move forward, you can approve the quote directly from the quote page.\n\nQuote Number: ${data.quoteNumber}\nProject Total: ${grandTotalFormatted}\nValid Through: ${expFormatted}\n\n${sharedTail}`,
          );
        } else {
          setEmailSubject(`Your Custom Quote from Threefold Supply Co.`);
          setEmailBody(
            `Hi ${contactName},\n\nThank you for considering Threefold Supply Co.! We've prepared a custom quote for your project.\n\nQuote Number: ${data.quoteNumber}\nProject Total: ${grandTotalFormatted}\nValid Through: ${expFormatted}\n\nView your full quote — including pricing breakdown — here:\n${data.publicLink}\n\n${sharedTail}`,
          );
        }
        setStep("preview");
      })
      .catch((err: unknown) => {
        setStep("error");
        setErrorMsg(String(err));
      });
  };

  const handleSend = async () => {
    if (!quoteResult || !sender) return;
    setStep("sending");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
          recordId: quoteResult.quoteId,
          recordType: "quote",
        }),
      });
      const data = await res.json() as { sent?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setStep("sent");
      setTimeout(() => {
        onSent(quoteResult, sender);
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setStep("error");
      setErrorMsg(String(err));
    }
  };

  const handleCreateDraft = async () => {
    await openGmailDraftOrFallback({ to: emailTo, subject: emailSubject, body: emailBody });
  };

  const copyToClipboard = async (target: CopyTarget, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(""), 1800);
  };

  if (!open || !lead) return null;

  const modalTitle =
    step === "details" ? "Quote Details" : step === "preview" ? "Email Preview" : "Send Quote";

  const footer =
    step === "details" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-3xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePreviewEmail}
          disabled={!hasValidItems}
          className="min-h-11 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Preview Email
        </button>
      </div>
    ) : step === "preview" ? (
      <div className="flex flex-col gap-3">
        <SenderPicker
          label={lead.stage === "Quote Sent" ? "Who is sending this revised quote?" : "Who is sending this quote?"}
          value={sender}
          onChange={setSender}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-3xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCreateDraft()}
              className="min-h-11 rounded-3xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!sender}
              className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <Send size={14} />
              Send Now
            </button>
          </div>
        </div>
      </div>
    ) : step === "error" ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-3xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => setStep("details")}
          className="min-h-11 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Back to details
        </button>
      </div>
    ) : null;

  return (
    <ModalShell
      title={modalTitle}
      subtitle={`${lead.company} · ${lead.email}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      {/* ── Step: details ────────────────────────────────────── */}
      {step === "details" && (
        <div className="flex flex-col gap-5">
          <div className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {/* Name + Description */}
                <div className="grid gap-2 sm:grid-cols-[5fr_7fr]">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Item name</label>
                    <select
                      value={item.name}
                      onChange={(e) => selectPresetItem(idx, e.target.value)}
                      className="w-full cursor-pointer rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                    >
                      <option value="">Select an item…</option>
                      {QUOTE_ITEM_PRESETS.map((preset) => (
                        <option key={preset.name} value={preset.name}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                      placeholder="e.g. Black oversized tee with front/back print"
                    />
                  </div>
                </div>
                {/* Qty + Unit price + Line total + Delete */}
                <div className="mt-2 flex items-start gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={item.quantity === 0 ? "" : item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", Number(e.target.value) || 0)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Client unit price</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice === 0 ? "" : item.unitPrice}
                      onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                      placeholder="0.00"
                    />
                    {item.originalUnitPrice != null && item.originalUnitPrice > item.unitPrice && (
                      <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                        Standard price: {fmtCurrency(item.originalUnitPrice)}<br />
                        Client will see: <span className="line-through">{fmtCurrency(item.originalUnitPrice)}</span> → {fmtCurrency(item.unitPrice)}<br />
                        Custom Pricing Applied
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mb-1 text-xs font-semibold text-slate-500">Line total</p>
                    <p className="py-2.5 text-xs font-semibold text-slate-950 md:text-sm">
                      {fmtCurrency(item.lineTotal)}
                    </p>
                  </div>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label="Remove item"
                      className="mb-1.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="flex w-fit items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>

          {/* Totals */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Subtotal</span>
              <span className="text-sm font-semibold text-slate-950">{fmtCurrency(subTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sales Tax ({fmtTaxRate(taxRate)})</span>
              <span className="text-sm font-semibold text-slate-500">{fmtCurrency(salesTaxAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Total</span>
              <span className="text-xl font-bold text-slate-950">{fmtCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: generating ─────────────────────────────────── */}
      {step === "generating" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm text-slate-600">Generating quote...</p>
        </div>
      )}

      {/* ── Step: sending ────────────────────────────────────── */}
      {step === "sending" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-900" />
          <p className="text-sm text-slate-600">Sending email...</p>
        </div>
      )}

      {/* ── Step: sent ───────────────────────────────────────── */}
      {step === "sent" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-base font-semibold text-slate-950">Quote Sent</p>
          <p className="text-sm text-slate-500">
            Lead moved to <strong>Quote Sent</strong>.
          </p>
        </div>
      )}

      {/* ── Step: error ──────────────────────────────────────── */}
      {step === "error" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {/* ── Step: preview ────────────────────────────────────── */}
      {step === "preview" && quoteResult && (
        <div className="flex flex-col gap-6">
          {/* Quote info strip */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quote #</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{quoteResult.quoteNumber}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Expires</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{fmtDate(quoteResult.expirationDate)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Public link</p>
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
            <div className="mt-3 border-t border-slate-200 pt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>Tax: {fmtTaxRate(quoteResult.salesTaxRate ?? taxRate)}</span>
              <span className="text-slate-300">·</span>
              <span>{quoteResult.taxJurisdictionLabel ?? "Bay Area, CA (default)"}</span>
              {quoteResult.taxRateWarning && (
                <span className="text-amber-600">· {quoteResult.taxRateWarning}</span>
              )}
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
                  <Copy className="h-3.5 w-3.5" />
                  {copied === "subject" ? "Copied" : "Copy Subject"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyToClipboard("body", emailBody)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === "body" ? "Copied" : "Copy Body"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyToClipboard("link", quoteResult.publicLink)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
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
                rows={10}
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
