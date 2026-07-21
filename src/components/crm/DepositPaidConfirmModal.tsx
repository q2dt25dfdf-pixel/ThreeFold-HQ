"use client";

import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import { businessTodayISO } from "@/lib/businessDate";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/receipt";
import { CurrencyInput } from "@/components/orders/OrderFormShared";
import type { Lead } from "./types";

// What the founder confirms before the client/order/invoice are created.
export type DepositPaidConfirmation = {
  amount: number;
  paymentType: "deposit" | "full";
  method: string;
  date: string;
};

type Prefill = { total: number; amount: number; method: string };

type Props = {
  lead: Lead;
  // Pre-filled from the deposit request / quote (what the client declared).
  prefill: Prefill;
  onConfirm: (confirmed: DepositPaidConfirmation) => Promise<void>;
  onClose: () => void;
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function DepositPaidConfirmModal({ lead, prefill, onConfirm, onClose }: Props) {
  const [amount, setAmount] = useState<string>((prefill.amount || 0).toFixed(2));
  // Pre-select "Paid in full" when the declared amount already covers the order total.
  const [paymentType, setPaymentType] = useState<"deposit" | "full">(
    prefill.total > 0 && prefill.amount >= prefill.total ? "full" : "deposit",
  );
  // Method from what they declared, else Check (the common case for this manual flow).
  const [method, setMethod] = useState<string>(prefill.method || "check");
  const [date, setDate] = useState<string>(() => businessTodayISO());
  const [saving, setSaving] = useState(false);

  const amountNum = Math.max(Math.round((parseFloat(amount) || 0) * 100) / 100, 0);
  const valid = amountNum > 0 && Boolean(date);

  const handleConfirm = async () => {
    if (!valid || saving) return;
    setSaving(true);
    await onConfirm({ amount: amountNum, paymentType, method, date });
    setSaving(false);
  };

  const footer = (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="min-h-11 flex-1 rounded-3xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 md:text-sm"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={!valid || saving}
        className="min-h-11 flex-1 rounded-3xl bg-emerald-600 py-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 md:text-sm"
      >
        {saving ? "Creating..." : "Confirm & create"}
      </button>
    </div>
  );

  const toggleBtn = (value: "deposit" | "full", label: string) => (
    <button
      type="button"
      onClick={() => setPaymentType(value)}
      className={`flex-1 rounded-2xl px-3 py-2 text-xs font-semibold transition md:text-sm ${paymentType === value ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  return (
    <ModalShell
      title={`${lead.company} is moving to Deposit Paid`}
      subtitle="Confirm what they actually paid. This creates their order, invoice, and portal."
      maxWidth="max-w-md"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        <p className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 md:text-xs">
          Pre-filled from what they declared on the quote page. Adjust if the check came in different.
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Amount received</label>
          <CurrencyInput
            valueDollars={parseFloat(amount) || 0}
            onChangeDollars={(d) => setAmount(d ? String(d) : "")}
            ariaLabel="Amount received"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
          {prefill.total > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">Order total: {fmt(prefill.total)}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">This payment is</label>
          <div className="flex gap-2">
            {toggleBtn("deposit", "Deposit (balance later)")}
            {toggleBtn("full", "Paid in full")}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none md:text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date received</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 md:text-sm"
            />
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
