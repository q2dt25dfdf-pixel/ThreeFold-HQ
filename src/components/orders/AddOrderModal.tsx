"use client";

import { useMemo, useState } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type LookupRecord = {
  id: string;
  name: string;
  company?: string;
};

type OrderStatus = "Draft" | "In Production" | "Quality Control" | "Fulfilled";

type Order = {
  id: string;
  orderName: string;
  client: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: number;
  status: OrderStatus;
  estimatedDeliveryDate: string;
  notes: string;
};

type AddOrderModalProps = {
  open: boolean;
  onClose: () => void;
  prefilledClient?: string;
  prefilledVendor?: string;
  onSaved?: (order: Order) => void;
};

type AddOrderModalContentProps = Omit<AddOrderModalProps, "open">;

const itemOptions = ["T-Shirts", "Hoodies", "Long Sleeves", "Hats", "Jackets", "Tumblers", "Mugs", "Accessories", "Other"];
const statusOptions: OrderStatus[] = ["Draft", "In Production", "Quality Control", "Fulfilled"];

function centsToCurrency(cents: string) {
  return (Number(cents || "0") / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function recordName(record: LookupRecord) {
  return record.name || record.company || "";
}

function SmartSearchInput({
  label,
  value,
  onChange,
  records,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  records: LookupRecord[];
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      records
        .filter((record) => {
          const name = recordName(record).toLowerCase();
          return normalizedValue.length > 0 && name.includes(normalizedValue);
        })
        .slice(0, 6),
    [normalizedValue, records],
  );
  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">{label}</label>
      <input
        type="text"
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
        placeholder={placeholder}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => onChange(event.target.value)}
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl">
          {suggestions.map((record) => {
            const name = recordName(record);

            return (
              <button
                key={record.id}
                type="button"
                className="block w-full px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(name);
                  setFocused(false);
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AddOrderModal({ open, onClose, prefilledClient = "", prefilledVendor = "", onSaved }: AddOrderModalProps) {
  if (!open) return null;

  return (
    <AddOrderModalContent
      onClose={onClose}
      prefilledClient={prefilledClient}
      prefilledVendor={prefilledVendor}
      onSaved={onSaved}
    />
  );
}

function AddOrderModalContent({ onClose, prefilledClient = "", prefilledVendor = "", onSaved }: AddOrderModalContentProps) {
  const { data: clients } = useSupabaseTable<LookupRecord>("clients", []);
  const { data: vendors } = useSupabaseTable<LookupRecord>("vendors", []);
  const { upsertItem } = useSupabaseTable<Order>("orders", []);
  const [orderName, setOrderName] = useState("");
  const [client, setClient] = useState(prefilledClient);
  const [vendor, setVendor] = useState(prefilledVendor);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("");
  const [amountCents, setAmountCents] = useState("");
  const [status, setStatus] = useState<OrderStatus>("Draft");
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");


  const toggleItem = (item: string) => {
    setSelectedItems((current) =>
      current.includes(item) ? current.filter((selectedItem) => selectedItem !== item) : [...current, item],
    );
  };

  const handleCurrencyKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (["Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      setAmountCents((current) => current.slice(0, -1));
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      setAmountCents((current) => (current + event.key).replace(/^0+(?=\d)/, ""));
      return;
    }

    event.preventDefault();
  };

  const handleSave = () => {
    if (!orderName.trim()) return;

    const order: Order = {
      id: `order-${Date.now()}`,
      orderName: orderName.trim(),
      client: client.trim(),
      vendor: vendor.trim(),
      items: selectedItems,
      quantity: Number(quantity || 0),
      amount: Number(amountCents || "0") / 100,
      status,
      estimatedDeliveryDate,
      notes: notes.trim(),
    };

    upsertItem(order);
    onSaved?.(order);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-2 shadow-xl md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base md:text-2xl font-semibold text-slate-950">Add order</h2>
            <p className="mt-1 text-xs md:text-sm text-slate-600">Create one shared order record for production, vendors, and finances.</p>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-full bg-slate-100 px-3 py-2 text-xs md:text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Order name</label>
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
              placeholder="e.g. Spring staff shirts"
              value={orderName}
              onChange={(event) => setOrderName(event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SmartSearchInput label="Client" value={client} onChange={setClient} records={clients} placeholder="Type to search clients..." />
            <SmartSearchInput label="Vendor" value={vendor} onChange={setVendor} records={vendors} placeholder="Type to search vendors..." />
          </div>

          <div>
            <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Items</label>
            <div className="flex flex-wrap gap-2">
              {itemOptions.map((item) => {
                const selected = selectedItems.includes(item);

                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={selected}
                    className={`rounded-2xl border px-3 py-2 text-xs md:text-sm font-semibold transition ${
                      selected
                        ? "border-slate-400 bg-gray-100 text-slate-900"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-gray-100"
                    }`}
                    onClick={() => toggleItem(item)}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Quantity</label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                placeholder="e.g. 48"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/^0+(?=\d)/, ""))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Amount</label>
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={centsToCurrency(amountCents)}
                onKeyDown={handleCurrencyKeyDown}
                onPaste={(event) => {
                  event.preventDefault();
                  setAmountCents((current) => (current + event.clipboardData.getData("text").replace(/\D/g, "")).replace(/^0+(?=\d)/, ""));
                }}
                onChange={() => {}}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</label>
              <select
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as OrderStatus)}
              >
                {statusOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Est. delivery date</label>
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={estimatedDeliveryDate}
                onClick={(event) => event.currentTarget.showPicker?.()}
                onChange={(event) => setEstimatedDeliveryDate(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
            <textarea
              rows={4}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
              placeholder="Order details, delivery notes, production reminders..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800"
            onClick={handleSave}
          >
            Save order
          </button>
          <button
            type="button"
            className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
