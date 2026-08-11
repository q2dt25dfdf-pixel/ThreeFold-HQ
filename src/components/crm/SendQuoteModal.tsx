"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Copy, Loader2, Plus, Send, X } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import SenderPicker, { type Sender } from "@/components/SenderPicker";
import { openGmailDraftOrFallback } from "@/lib/emailCompose";
import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";
import { supabase } from "@/lib/supabase";
import {
  calcGrandTotal,
  calcSalesTax,
  calcDiscountAmount,
  calcDiscountedSubtotal,
  fmtTaxRate,
  type QuoteDiscount,
} from "@/lib/salesTax";
import { getSalesTaxRateForAddress, zipFromText } from "@/lib/tax-rates";
import type { Lead, QuoteItem } from "./types";
import { PRODUCT_CATALOG, findProduct } from "@/lib/products";
import { CurrencyInput } from "@/components/orders/OrderFormShared";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { buildBlankSuggestions } from "@/lib/blankSuggestions";
import BlankCombobox from "@/components/BlankCombobox";
import { isBlank, type InventoryItem } from "@/lib/inventory";

// Minimal row shape for reading historical blanks off past records.
type BlankHistoryRow = { id: string; line_items?: { blank?: unknown }[] | null };

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
  // Persist an inline-edited delivery address back to the lead (single source of truth).
  // Reuses the parent's existing lead-save path; fired on blur / autocomplete select only.
  onAddressSave?: (lead: Lead, address: string) => void;
}

type Step = "details" | "generating" | "preview" | "sending" | "sent" | "error";
type CopyTarget = "subject" | "body" | "link";

function newItem(): QuoteItem {
  return { name: "", description: "", quantity: 1, unitPrice: 0, lineTotal: 0, blank: "", colors: [{ color: "", qty: 1 }], print_detail: "" };
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

export default function SendQuoteModal({ open, lead, onClose, onSent, onAddressSave }: Props) {
  const [step, setStep] = useState<Step>("details");
  // Delivery address, inline-editable; seeded from the lead and re-seeded when the modal
  // opens / the lead changes. Drives the tax preview, the send gate, and the generate payload.
  const [addressText, setAddressText] = useState(lead?.companyProfile?.address ?? "");
  const [lineItems, setLineItems] = useState<QuoteItem[]>([newItem()]);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState<CopyTarget | "">("");
  const [sender, setSender] = useState<Sender | "">("");
  const [sentVia, setSentVia] = useState<"gmail" | "resend" | "">("");
  const [discountActive, setDiscountActive] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValueInput, setDiscountValueInput] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  // Minimum deposit the client must pay at approval (percent of total). Default 50%.
  const [depositMinPct, setDepositMinPct] = useState(50);
  const [depositCustom, setDepositCustom] = useState(false);

  // Blank-field suggestions. Source order: inventory Blanks FIRST (garment level —
  // brand+style+color, size dropped since the line item has its own sizes), then the
  // seed + distinct blanks typed on past quotes/orders/deposits so nothing regresses.
  // Free-text is always allowed (blanks not in inventory still work).
  const { data: quoteHistory } = useSupabaseTable<BlankHistoryRow>("quotes", []);
  const { data: orderHistory } = useSupabaseTable<BlankHistoryRow>("orders", []);
  const { data: depositHistory } = useSupabaseTable<BlankHistoryRow>("deposit_requests", []);
  const { data: inventory } = useSupabaseTable<InventoryItem>("inventory", []);

  const inventoryBlanks = useMemo(() => {
    const byKey = new Map<string, string>(); // lc -> original casing
    for (const it of inventory) {
      if (!isBlank(it.category)) continue;
      const label = [it.brand, it.style, it.color].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
      if (label && !byKey.has(label.toLowerCase())) byKey.set(label.toLowerCase(), label);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [inventory]);

  const blankOptions = useMemo(() => {
    const seed = buildBlankSuggestions(
      [quoteHistory, orderHistory, depositHistory],
      PRODUCT_CATALOG.map((p) => p.blank),
    );
    const seen = new Set(inventoryBlanks.map((b) => b.toLowerCase()));
    const rest = seed.filter((b) => !seen.has(b.toLowerCase()));
    return [...inventoryBlanks, ...rest]; // inventory first, then seed + history
  }, [inventoryBlanks, quoteHistory, orderHistory, depositHistory]);

  useEffect(() => {
    if (!open || !lead) return;
    setStep("details");
    setLineItems([newItem()]);
    setQuoteResult(null);
    setErrorMsg("");
    setCopied("");
    setSender("");
    setSentVia("");
    setDiscountActive(false);
    setDiscountType("percent");
    setDiscountValueInput("");
    setDiscountLabel("");
    setDepositMinPct(50);
    setDepositCustom(false);
    setEmailTo(lead.email ?? "");
    setAddressText(lead.companyProfile?.address ?? "");
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateItem = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        updated.lineTotal = updated.quantity * updated.unitPrice;
        // With exactly one color row, its qty mirrors the line quantity (quantity stays
        // the source of truth). Multiple rows are allocated by hand and validated below.
        if (field === "quantity" && (updated.colors?.length ?? 0) === 1) {
          updated.colors = [{ ...updated.colors![0], qty: Number(value) || 0 }];
        }
        return updated;
      }),
    );
  };

  // Selects a product name and auto-fills its description + price + default blank from
  // the shared catalog. Manual edits afterwards are independent of this.
  const selectPresetItem = (idx: number, name: string) => {
    const preset = findProduct(name);
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = {
          ...item,
          name,
          ...(preset
            ? { description: preset.description, unitPrice: preset.unitPrice, originalUnitPrice: preset.unitPrice, blank: item.blank || preset.blank }
            : {}),
        };
        updated.lineTotal = updated.quantity * updated.unitPrice;
        return updated;
      }),
    );
  };

  const addItem = () => setLineItems((prev) => [...prev, newItem()]);
  const removeItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));

  // Color-breakdown row helpers (internal production spec).
  const updateColor = (itemIdx: number, colorIdx: number, field: "color" | "qty", value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIdx) return item;
        const colors = (item.colors ?? []).map((c, ci) => (ci === colorIdx ? { ...c, [field]: value } : c));
        return { ...item, colors };
      }),
    );
  };
  const addColor = (itemIdx: number) =>
    setLineItems((prev) => prev.map((item, i) => (i === itemIdx ? { ...item, colors: [...(item.colors ?? []), { color: "", qty: 0 }] } : item)));
  const removeColor = (itemIdx: number, colorIdx: number) =>
    setLineItems((prev) => prev.map((item, i) => (i === itemIdx ? { ...item, colors: (item.colors ?? []).filter((_, ci) => ci !== colorIdx) } : item)));

  const clearDiscount = () => {
    setDiscountActive(false);
    setDiscountType("percent");
    setDiscountValueInput("");
    setDiscountLabel("");
  };

  const subTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  // Preview rate mirrors the server: derive it from the lead's address via the SAME pure
  // lookup (getSalesTaxRateForAddress) the server uses, using the SAME clientAddressText the
  // modal already sends to /api/quote/generate. This is display-only; the server remains the
  // source of truth and still computes/stores the rate itself. getSalesTaxRateForAddress
  // handles the fallback to the 0.09375 default (with a warning) when no ZIP resolves.
  const taxLookup = getSalesTaxRateForAddress({ clientAddressText: addressText });
  const taxRate = taxLookup.rate;

  // Discount (client-side, using the shared lib helpers — no local math).
  // subtotal stays PRE-discount; discountedSubtotal feeds tax + grand total.
  const discountValue = parseFloat(discountValueInput) || 0;
  const discount: QuoteDiscount | null =
    discountActive && discountValue > 0
      ? { type: discountType, value: discountValue, label: discountLabel.trim() }
      : null;
  const discountAmount = calcDiscountAmount(subTotal, discount);
  const discountedSubtotal = discount ? calcDiscountedSubtotal(subTotal, discount) : subTotal;
  const salesTaxAmount = calcSalesTax(discountedSubtotal, taxRate);
  const grandTotal = calcGrandTotal(discountedSubtotal, taxRate);
  const discountRowLabel =
    (discountLabel.trim() || "Discount") + (discountType === "percent" ? ` (-${discountValue}%)` : "");

  const hasValidItems = lineItems.some((i) => i.name.trim() && i.quantity > 0);
  // Label is required once a positive discount value is entered.
  const discountLabelMissing = discountActive && discountValue > 0 && !discountLabel.trim();
  // A discount that leaves a sub-$1.00 total is unpayable (Stripe rejects charges
  // under ~$0.50). Block it here to match the server guard.
  const discountZeroesTotal = discount != null && discountedSubtotal < 1;
  // Sales tax needs a real ship-to ZIP. The quote uses the client's address
  // (lead.companyProfile.address) - the SAME clientAddressText passed to /api/quote/generate -
  // and the business ships there. "Valid" == the tax calc will resolve a ZIP, checked with the
  // EXACT parser the tax lookup uses (zipFromText). Block the quote until that address has a ZIP.
  const addressHasZip = Boolean(zipFromText(addressText));
  const canPreview = hasValidItems && !discountLabelMissing && !discountZeroesTotal && addressHasZip;

  // Persist an inline address edit back to the lead (single source of truth) via the parent's
  // existing save path. Fired on blur / autocomplete select only (not per keystroke). No-ops when
  // unchanged. The generate payload uses addressText directly, so tax stays correct regardless.
  const saveAddress = (value: string) => {
    if (!lead) return;
    const next = value.trim();
    if (next === (lead.companyProfile?.address ?? "").trim()) return;
    onAddressSave?.(lead, next);
  };

  const handlePreviewEmail = async () => {
    if (!lead || !canPreview) return;

    // STEP 5 — revision guard. Generating a new quote voids the lead's existing
    // (unpaid) deposit request server-side, which kills the client's current payment
    // link. Warn the founder BEFORE that happens; block outright if the deposit is
    // already paid/in-flight (a manual credit situation, not a stale-deposit one).
    if (lead.stage === "Quote Sent" && lead.deposit_request_id) {
      const { data: depRows } = await supabase
        .from("deposit_requests")
        .select("data")
        .eq("id", lead.deposit_request_id)
        .limit(1);
      const dep = depRows?.[0]?.data as { status?: string; deposit_request_number?: string; voided_at?: string } | undefined;
      const depStatus = dep?.status ?? "";
      const depNumber = dep?.deposit_request_number ?? lead.deposit_request_number ?? "the existing deposit request";
      if (dep && !dep.voided_at) {
        if (depStatus === "paid" || depStatus === "pending") {
          window.alert(
            `The client has already ${depStatus === "paid" ? "paid" : "started paying"} against deposit request ${depNumber}. ` +
            `Revising the quote here won't change that — this needs a manual credit or refund. ` +
            `Handle the payment first, then revise.`,
          );
          return;
        }
        const ok = window.confirm(
          `This will void deposit request ${depNumber}. The client's existing payment link will stop working. ` +
          `You'll need to send a new one. Continue?`,
        );
        if (!ok) return;
      }
    }

    const validItems = lineItems.filter((i) => i.name.trim());
    const computedSubtotal = validItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const computedDiscountAmount = calcDiscountAmount(computedSubtotal, discount);
    const computedDiscountedSubtotal = discount
      ? calcDiscountedSubtotal(computedSubtotal, discount)
      : computedSubtotal;
    const computedTax = calcSalesTax(computedDiscountedSubtotal, taxRate);
    const computedGrandTotal = computedDiscountedSubtotal + computedTax;

    setStep("generating");

    fetch("/api/quote/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        clientName: lead.company,
        clientEmail: lead.email,
        clientAddressText: addressText,
        subtotal: computedSubtotal,
        discount,
        depositMinimum: depositMinPct / 100,
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

        // Pricing block: full breakdown only when a discount applies; otherwise the
        // email is unchanged (just the project total), so no-discount emails are identical.
        const pricingLines = discount
          ? `Subtotal: ${fmtCurrency(computedSubtotal)}\n${discount.label}: -${fmtCurrency(computedDiscountAmount)}\nSales Tax: ${fmtCurrency(computedTax)}\nProject Total: ${grandTotalFormatted}`
          : `Project Total: ${grandTotalFormatted}`;

        const sharedTail = `This quote is valid for 30 days.\n\nTo move forward, we require at least a 50% deposit before production begins. Any remaining balance is due before the completed order is delivered or shipped.\n\nIf everything looks good, approve your quote at the link above, give us a call, or send us a text. We'll send your invoice and get your project into production.\n\nIf you have any questions at all, please don't hesitate to reach out.\n\n${TF_PLAIN_CLOSING}`;

        if (isRevised) {
          setEmailSubject(`Updated Quote from Threefold Supply Co.`);
          setEmailBody(
            `Hello ${contactName},\n\nWe've updated your quote based on the changes discussed and attached the revised pricing for your review.\n\nYou can view your updated quote and pricing breakdown here:\n${data.publicLink}\n\nPlease take a look and let us know if everything looks correct. If you'd like to make any additional adjustments, simply reply to this email and we'll be happy to update it further.\n\nOnce you're ready to move forward, you can approve the quote directly from the quote page.\n\nQuote Number: ${data.quoteNumber}\n${pricingLines}\nValid Through: ${expFormatted}\n\n${sharedTail}`,
          );
        } else {
          setEmailSubject(`Your Custom Quote from Threefold Supply Co.`);
          setEmailBody(
            `Hi ${contactName},\n\nThank you for considering Threefold Supply Co.! We've prepared a custom quote for your project.\n\nQuote Number: ${data.quoteNumber}\n${pricingLines}\nValid Through: ${expFormatted}\n\nView your full quote, including pricing breakdown:\n${data.publicLink}\n\n${sharedTail}`,
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
      const data = await res.json() as { sent?: boolean; error?: string; sentVia?: "gmail" | "resend" };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setSentVia(data.sentVia ?? "");
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
    const result = await openGmailDraftOrFallback({ to: emailTo, subject: emailSubject, body: emailBody });
    if (!result.ok) {
      setErrorMsg(result.error ?? "Failed to create Gmail draft. Check Gmail API credentials in Vercel.");
      setStep("error");
    }
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
      <div className="flex flex-col gap-3">
        {!addressHasZip && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 md:text-sm">
            Add a delivery address with a ZIP code before sending this quote. The address is used
            to calculate sales tax. Add it on the lead, then reopen this quote.
          </div>
        )}
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
            onClick={() => void handlePreviewEmail()}
            disabled={!canPreview}
            title={
              !addressHasZip
                ? "Add a delivery address with a ZIP code first (used to calculate sales tax)"
                : discountLabelMissing
                ? "Add a discount label first"
                : discountZeroesTotal
                ? "Discount reduces the total below $1.00"
                : undefined
            }
            className="min-h-11 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Preview Email
          </button>
        </div>
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
            {lineItems.map((item, idx) => {
              const product = findProduct(item.name);
              const catalogColors = product?.colors ?? [];
              return (
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
                      {PRODUCT_CATALOG.map((preset) => (
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
                    <CurrencyInput
                      valueDollars={item.unitPrice}
                      onChangeDollars={(d) => updateItem(idx, "unitPrice", d)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                      ariaLabel="Client unit price"
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

                {/* ── Production spec (internal — never shown to the client) ── */}
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Production spec (internal)</p>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Blank</label>
                    <BlankCombobox
                      value={item.blank ?? ""}
                      onChange={(v) => updateItem(idx, "blank", v)}
                      options={blankOptions}
                      placeholder="e.g. Comfort Colors C1717 Black"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Color breakdown</label>
                    <div className="space-y-2">
                      {(item.colors ?? []).map((c, ci) => (
                        <div key={ci} className="flex items-center gap-2">
                          <input
                            type="text"
                            list={`colors-${idx}`}
                            value={c.color}
                            onChange={(e) => updateColor(idx, ci, "color", e.target.value)}
                            className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                            placeholder="Color"
                          />
                          <input
                            type="number"
                            min={0}
                            value={c.qty === 0 ? "" : c.qty}
                            onChange={(e) => updateColor(idx, ci, "qty", Number(e.target.value) || 0)}
                            className="w-20 shrink-0 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                            placeholder="Qty"
                          />
                          {(item.colors?.length ?? 0) > 1 && (
                            <button
                              type="button"
                              onClick={() => removeColor(idx, ci)}
                              aria-label="Remove color"
                              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {catalogColors.length > 0 && (
                      <datalist id={`colors-${idx}`}>
                        {catalogColors.map((col) => (
                          <option key={col} value={col} />
                        ))}
                      </datalist>
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <button type="button" onClick={() => addColor(idx)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                        + Add color
                      </button>
                      {(() => {
                        const colorSum = (item.colors ?? []).reduce((s, c) => s + (Number(c.qty) || 0), 0);
                        const mismatch = (item.colors?.length ?? 0) > 0 && colorSum !== item.quantity;
                        return (
                          <span className={`text-[11px] font-semibold ${mismatch ? "text-amber-600" : "text-slate-400"}`}>
                            Colors {colorSum} / qty {item.quantity}{mismatch ? " (should match)" : ""}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Print / detail (optional)</label>
                    <input
                      type="text"
                      value={item.print_detail ?? ""}
                      onChange={(e) => updateItem(idx, "print_detail", e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                      placeholder="e.g. Front left chest + full back, white ink"
                    />
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={addItem}
              className="flex w-fit items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </button>

            {/* Discount */}
            {!discountActive ? (
              <button
                type="button"
                onClick={() => setDiscountActive(true)}
                className="w-fit text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                + Add discount
              </button>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Discount</span>
                  <button
                    type="button"
                    onClick={clearDiscount}
                    aria-label="Remove discount"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Toggle + value on one row (wraps safely at 375px); label full width beneath */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="inline-flex shrink-0 overflow-hidden rounded-2xl border border-slate-300">
                    <button
                      type="button"
                      onClick={() => setDiscountType("percent")}
                      className={`px-3.5 py-2.5 text-xs font-semibold ${discountType === "percent" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("fixed")}
                      className={`px-3.5 py-2.5 text-xs font-semibold ${discountType === "fixed" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      $
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={discountType === "percent" ? 1 : 0.01}
                    value={discountValueInput}
                    onChange={(e) => setDiscountValueInput(e.target.value)}
                    placeholder={discountType === "percent" ? "0" : "0.00"}
                    aria-label="Discount value"
                    className="w-24 shrink-0 rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                  />
                </div>
                <input
                  type="text"
                  value={discountLabel}
                  onChange={(e) => setDiscountLabel(e.target.value)}
                  placeholder="e.g. Loyalty discount"
                  aria-label="Discount label"
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                />
                {discountLabelMissing && (
                  <p className="mt-1.5 text-[10px] font-semibold text-rose-500">
                    Add a label to apply this discount (e.g. &quot;Loyalty discount&quot;).
                  </p>
                )}
                {discountZeroesTotal && (
                  <p className="mt-1.5 text-[10px] font-semibold text-rose-500">
                    A discount cannot reduce the total below $1.00. Lower it so a balance remains.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Subtotal</span>
              <span className="text-sm font-semibold text-slate-950">{fmtCurrency(subTotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{discountRowLabel}</span>
                <span className="text-sm font-semibold text-slate-500">-{fmtCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sales Tax ({fmtTaxRate(taxRate)})</span>
              <span className="text-sm font-semibold text-slate-500">{fmtCurrency(salesTaxAmount)}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              {taxLookup.jurisdictionLabel}
              {taxLookup.warning && <span className="text-amber-600"> · {taxLookup.warning}</span>}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Total</span>
              <span className="text-xl font-bold text-slate-950">{fmtCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Delivery address - inline editable; drives the sales-tax calc + the send gate.
              Saved back to the lead on blur / autocomplete select. */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Delivery address (used for sales tax)
            </label>
            <AddressAutocomplete
              value={addressText}
              onChange={setAddressText}
              onBlur={() => saveAddress(addressText)}
              onSelect={(value) => { setAddressText(value); saveAddress(value); }}
              placeholder="Street, city, state ZIP"
              className="w-full min-w-0 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
            />
          </div>

          {/* Minimum deposit — the least the client may pay when they approve */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Minimum deposit</span>
              <span className="text-xs font-semibold text-slate-500">min {fmtCurrency(Math.round(grandTotal * depositMinPct) / 100)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {[50, 75, 100].map((p) => {
                const active = !depositCustom && depositMinPct === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setDepositMinPct(p); setDepositCustom(false); }}
                    className={`rounded-2xl border px-3 py-1.5 text-xs font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {p}%
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setDepositCustom(true)}
                className={`rounded-2xl border px-3 py-1.5 text-xs font-semibold ${depositCustom ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Custom
              </button>
              {depositCustom && (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={depositMinPct}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      setDepositMinPct(Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 1);
                    }}
                    aria-label="Custom minimum deposit percent"
                    className="w-16 rounded-2xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-slate-400"
                  />
                  <span className="text-xs font-semibold text-slate-500">%</span>
                </div>
              )}
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
          {sentVia && (
            <p className="text-xs text-slate-400">
              Sent via {sentVia === "gmail" ? "Gmail API" : "Resend"}
            </p>
          )}
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
