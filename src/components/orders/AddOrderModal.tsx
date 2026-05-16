"use client";

import { useState } from "react";
import { FieldError } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import ModalShell from "@/components/ModalShell";
import {
  centsToCurrency,
  handleCurrencyKeyDown,
  itemOptions,
  LookupRecord,
  OrderStatus,
  recordName,
  SmartSearchInput,
  statusOptions,
} from "./OrderFormShared";

type Order = {
  id: string;
  orderName: string;
  order_name?: string;
  client: string;
  client_id?: string;
  client_name?: string;
  vendor: string;
  vendor_id?: string;
  vendor_name?: string;
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
  onSaved?: (order: Order) => void | Promise<void>;
};

type AddOrderModalContentProps = Omit<AddOrderModalProps, "open">;

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
  const [clientId, setClientId] = useState("");
  const [vendor, setVendor] = useState(prefilledVendor);
  const [vendorId, setVendorId] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("");
  const [amountCents, setAmountCents] = useState("");
  const [status, setStatus] = useState<OrderStatus>("Draft");
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const { saveState, runSave } = useSaveState();
  const [formError, setFormError] = useState("");

  const toggleItem = (item: string) => {
    setSelectedItems((current) =>
      current.includes(item) ? current.filter((selectedItem) => selectedItem !== item) : [...current, item],
    );
  };

  const handleSave = async () => {
    if (!orderName.trim()) {
      setFormError("Order name is required.");
      return;
    }
    const qty = Number(quantity);
    if (!quantity.trim() || qty <= 0) {
      setFormError("Quantity must be greater than 0.");
      return;
    }
    setFormError("");

    await runSave(async () => {
      const resolvedClient = clients.find((record) => recordName(record).trim().toLowerCase() === client.trim().toLowerCase());
      const resolvedVendor = vendors.find((record) => recordName(record).trim().toLowerCase() === vendor.trim().toLowerCase());

      const order: Order = {
        id: `order-${Date.now()}`,
        orderName: orderName.trim(),
        order_name: orderName.trim(),
        client: client.trim(),
        client_id: clientId || resolvedClient?.id || "",
        client_name: client.trim(),
        vendor: vendor.trim(),
        vendor_id: vendorId || resolvedVendor?.id || "",
        vendor_name: vendor.trim(),
        items: selectedItems,
        quantity: qty,
        amount: Number(amountCents || "0") / 100,
        status,
        estimatedDeliveryDate,
        notes: notes.trim(),
      };

      const response = await upsertItem(order);
      if (response.error) return response;

      await onSaved?.(order);
      return response;
    });
  };

  return (
    <ModalShell
      title="Add order"
      subtitle="Create one shared order record for production, vendors, and finances."
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Order name</label>
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              placeholder="e.g. Spring staff shirts"
              value={orderName}
              onChange={(event) => {
                setOrderName(event.target.value);
                if (formError) setFormError("");
              }}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SmartSearchInput
              label="Client"
              value={client}
              onChange={(value) => { setClient(value); setClientId(""); }}
              onSelect={(record) => { setClient(recordName(record)); setClientId(record.id); }}
              records={clients}
              placeholder="Type to search clients..."
            />
            <SmartSearchInput
              label="Vendor"
              value={vendor}
              onChange={(value) => { setVendor(value); setVendorId(""); }}
              onSelect={(record) => { setVendor(recordName(record)); setVendorId(record.id); }}
              records={vendors}
              placeholder="Type to search vendors..."
            />
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
                min="1"
                step="1"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                placeholder="e.g. 48"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value.replace(/^0+(?=\d)/, ""));
                  if (formError) setFormError("");
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Amount</label>
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                value={centsToCurrency(amountCents)}
                onKeyDown={(event) => handleCurrencyKeyDown(event, setAmountCents)}
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
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900"
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
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
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
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              placeholder="Order details, delivery notes, production reminders..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <FieldError message={formError} />

        <div className="mt-6 flex gap-3">
          <SaveButton state={saveState} onClick={handleSave} className="flex-1 py-3" />
          <button
            type="button"
            className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
    </ModalShell>
  );
}
