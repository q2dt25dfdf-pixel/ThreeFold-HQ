"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { INVOICE_STATUS_OPTIONS, type InvoiceStatus } from "@/lib/constants";
import { calcBalance, calcCollected, calcDeposit, calcTotal, parseAmount } from "@/lib/invoiceCalc";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Invoice = {
  id: string;
  client: string;
  orderName: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_company?: string;
  order_id?: string;
  order_name?: string;
  amount?: string | number;
  total_amount: string | number;
  deposit_amount: string | number;
  deposit_paid: boolean;
  deposit_paid_date?: string;
  balance_remaining: string | number;
  final_due_date?: string;
  final_paid: boolean;
  final_paid_date?: string;
  dueDate?: string;
  status: InvoiceStatus;
  notes: string;
};

type Client = {
  id: string;
  name: string;
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
};

type Order = {
  id: string;
  orderName: string;
  client: string;
  client_id?: string;
  client_name?: string;
  order_name?: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: string | number;
  status: "Draft" | "In Production" | "Quality Control" | "Fulfilled";
  estimatedDeliveryDate: string;
  notes: string;
  invoice_total?: number;
  deposit_paid?: boolean;
  balance_due?: number;
};

const invoiceStatusOptions = INVOICE_STATUS_OPTIONS;
const emptyForm = { client: "", orderName: "", client_id: "", client_name: "", client_email: "", client_company: "", order_id: "", order_name: "", amount: 0, total_amount: 0, deposit_amount: 0, deposit_paid: false, deposit_paid_date: "", balance_remaining: 0, final_due_date: "", final_paid: false, final_paid_date: "", dueDate: "", status: "Draft" as InvoiceStatus, notes: "" };
type InvoiceFields = Invoice | typeof emptyForm;

const statusColors: Record<InvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-800",
  "Deposit Due": "bg-amber-100 text-amber-800",
  "Deposit Paid": "bg-emerald-100 text-emerald-800",
  "In Progress": "bg-blue-100 text-blue-800",
  "Final Payment Due": "bg-amber-100 text-amber-800",
  "Paid in Full": "bg-emerald-100 text-emerald-800",
  Overdue: "bg-red-100 text-red-800",
  Cancelled: "bg-slate-200 text-slate-600",
};

const statusPalette: Record<InvoiceStatus, string> = {
  Draft: "#64748b",
  Sent: "#3b82f6",
  "Deposit Due": "#f59e0b",
  "Deposit Paid": "#10b981",
  "In Progress": "#2563eb",
  "Final Payment Due": "#f59e0b",
  "Paid in Full": "#059669",
  Overdue: "#dc2626",
  Cancelled: "#94a3b8",
};

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function currencyInputValue(amount: unknown) {
  return parseAmount(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencyInputNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function parseInvoiceDate(rawDate: string | undefined) {
  if (!rawDate) return null;
  const date = new Date(rawDate + "T00:00:00");
  if (!Number.isNaN(date.getTime())) return date;
  const fallback = new Date(rawDate);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function invoiceMonthIndex(invoice: InvoiceFields) {
  const date = parseInvoiceDate(invoice.final_paid_date || invoice.deposit_paid_date || invoice.final_due_date || invoice.dueDate);
  return date?.getMonth() ?? -1;
}

function normalizeInvoiceStatus(status: unknown): InvoiceStatus {
  if (invoiceStatusOptions.includes(status as InvoiceStatus)) return status as InvoiceStatus;
  if (status === "Paid") return "Paid in Full";
  if (status === "Due") return "Final Payment Due";
  if (status === "Overdue") return "Overdue";
  return "Draft";
}

// Statuses that a deposit payment should advance — anything at or before "Deposit Paid" in the lifecycle.
const PRE_DEPOSIT_STATUSES = new Set<InvoiceStatus>(["Draft", "Sent", "Deposit Due", "Deposit Paid"]);

function deriveInvoiceStatus(invoice: { status: unknown; deposit_paid?: unknown; final_paid?: unknown }): InvoiceStatus {
  const current = normalizeInvoiceStatus(invoice.status);
  const depositPaid = Boolean(invoice.deposit_paid);
  const finalPaid = Boolean(invoice.final_paid);
  if (finalPaid) return "Paid in Full";
  if (depositPaid && PRE_DEPOSIT_STATUSES.has(current)) return "Deposit Paid";
  // If both flags are cleared but status is still payment-derived, revert to Sent.
  if (!depositPaid && !finalPaid && (current === "Deposit Paid" || current === "Paid in Full")) return "Sent";
  return current;
}

function clientDisplayName(client: Client) {
  return client.name || client.company || "Unnamed client";
}

function orderDisplayName(order: Order) {
  return order.order_name || order.orderName || "Untitled order";
}

function invoiceClientName(invoice: InvoiceFields) {
  return invoice.client_name || invoice.client;
}

function invoiceOrderName(invoice: InvoiceFields) {
  return invoice.order_name || invoice.orderName;
}

function invoiceTotal(invoice: InvoiceFields) {
  return calcTotal(invoice);
}

function invoiceDeposit(invoice: InvoiceFields) {
  return calcDeposit(invoice);
}

function invoiceBalance(invoice: InvoiceFields) {
  return calcBalance(invoice);
}

function invoiceCollected(invoice: InvoiceFields) {
  return calcCollected({ ...invoice, deposit_paid: Boolean(invoice.deposit_paid), final_paid: Boolean(invoice.final_paid) });
}

function normalizeInvoiceFinancials<T extends InvoiceFields>(invoice: T): T {
  const total = invoiceTotal(invoice);
  const deposit = parseAmount(invoice.deposit_amount) > 0 ? parseAmount(invoice.deposit_amount) : total * 0.5;
  const balance = Math.max(total - deposit, 0);

  return {
    ...invoice,
    amount: total,
    total_amount: total,
    deposit_amount: deposit,
    deposit_paid: Boolean(invoice.deposit_paid),
    deposit_paid_date: invoice.deposit_paid_date || "",
    balance_remaining: balance,
    final_due_date: invoice.final_due_date || invoice.dueDate || "",
    final_paid: Boolean(invoice.final_paid),
    final_paid_date: invoice.final_paid_date || "",
    status: deriveInvoiceStatus(invoice),
  } as T;
}

function updateInvoiceTotal<T extends InvoiceFields>(invoice: T, total: number): T {
  const deposit = total * 0.5;
  return normalizeInvoiceFinancials({ ...invoice, amount: total, total_amount: total, deposit_amount: deposit, balance_remaining: Math.max(total - deposit, 0) });
}

function updateInvoiceDeposit<T extends InvoiceFields>(invoice: T, deposit: number): T {
  return normalizeInvoiceFinancials({ ...invoice, deposit_amount: deposit, balance_remaining: Math.max(invoiceTotal(invoice) - deposit, 0) });
}

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function orderMatchesClient(order: Order, clientId: string | undefined, clientName: string | undefined) {
  const normalizedClientName = (clientName ?? "").trim().toLowerCase();
  const orderClientName = (order.client_name || order.client || "").trim().toLowerCase();

  if (clientId && order.client_id === clientId) return true;
  return Boolean(normalizedClientName && orderClientName && normalizedClientName === orderClientName);
}

function normalizeInvoiceLinks<T extends InvoiceFields>(invoice: T): T {
  const clientName = invoiceClientName(invoice);
  const orderName = invoiceOrderName(invoice);

  return {
    ...invoice,
    client: clientName,
    client_name: clientName,
    orderName,
    order_name: orderName,
  };
}

function normalizeInvoice<T extends InvoiceFields>(invoice: T): T {
  return normalizeInvoiceFinancials(normalizeInvoiceLinks(invoice));
}

function applyClientToInvoice<T extends InvoiceFields>(invoice: T, client: Client): T {
  const clientName = clientDisplayName(client);

  return normalizeInvoice({
    ...invoice,
    client: clientName,
    client_id: client.id,
    client_name: clientName,
    client_email: client.email ?? "",
    client_company: client.company || clientName,
    orderName: "",
    order_id: "",
    order_name: "",
  } as T);
}

function applyOrderToInvoice<T extends InvoiceFields>(invoice: T, order: Order): T {
  const orderName = orderDisplayName(order);
  const existingTotal = invoiceTotal(invoice);
  const orderAmount = parseAmount(order.amount);
  const total = existingTotal > 0 ? existingTotal : orderAmount;

  return normalizeInvoice({
    ...invoice,
    orderName,
    order_id: order.id,
    order_name: orderName,
    amount: total,
    total_amount: total,
    final_due_date: invoice.final_due_date || order.estimatedDeliveryDate || "",
    dueDate: invoice.dueDate || order.estimatedDeliveryDate || "",
  } as T);
}

export default function FinancesPage() {
  const { data: invoices, upsertItem, deleteItem, loading, error } = useSupabaseTable<Invoice>("finances", []);
  const { data: clients, reload: reloadClients } = useSupabaseTable<Client>("clients", []);
  const { data: orders, upsertItem: upsertOrder } = useSupabaseTable<Order>("orders", []);
  const [filter, setFilter] = useState<InvoiceStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const addSave = useSaveState();
  const editSave = useSaveState();
  const [form, setForm] = useState(emptyForm);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const normalizedInvoices = useMemo(() => invoices.map((invoice) => normalizeInvoice(invoice)), [invoices]);

  const syncInvoiceToOrder = async (invoice: InvoiceFields) => {
    const orderId = invoice.order_id;
    if (!orderId) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    await upsertOrder({
      ...order,
      invoice_total: calcTotal(invoice),
      deposit_paid: Boolean(invoice.deposit_paid),
      balance_due: calcBalance(invoice),
    });
  };

  const visible = (filter === "All" ? normalizedInvoices : normalizedInvoices.filter((invoice) => invoice.status === filter)).filter((invoice) =>
    Object.values(invoice).join(" ").toLowerCase().includes(query.toLowerCase()),
  );

  const revenueCollected = normalizedInvoices.reduce((sum, invoice) => sum + invoiceCollected(invoice), 0);
  const outstandingBalance = normalizedInvoices
    .filter((invoice) => !invoice.final_paid)
    .reduce((sum, invoice) => sum + invoiceBalance(invoice), 0);
  const totalInvoiceValue = normalizedInvoices
    .filter((invoice) => invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const overdueCount = normalizedInvoices.filter((invoice) => invoice.status === "Overdue").length;

  const monthlyRevenue = useMemo(() => {
    const monthlyTotals = monthLabels.map((month) => ({ month, collected: 0, outstanding: 0 }));

    normalizedInvoices.forEach((invoice) => {
      const month = invoiceMonthIndex(invoice);
      if (month < 0) return;

      monthlyTotals[month].collected += invoiceCollected(invoice);
      if (!invoice.final_paid) monthlyTotals[month].outstanding += invoiceBalance(invoice);
    });

    return monthlyTotals;
  }, [normalizedInvoices]);

  const goal = 50000;
  const goalPercent = Math.min(100, Math.round((revenueCollected / goal) * 100));
  const projectedCompletion = revenueCollected > 0 ? "Based on invoice payment history" : "Awaiting first paid invoice";

  const statusData = invoiceStatusOptions.map((status) => ({
    name: status,
    value: normalizedInvoices.filter((invoice) => invoice.status === status).length,
  }));

  const hydrateInvoiceLinks = (invoice: Invoice): Invoice => {
    const linked = normalizeInvoice(invoice);
    const linkedClientName = invoiceClientName(linked).trim().toLowerCase();
    const matchedClient = linked.client_id
      ? clients.find((client) => client.id === linked.client_id)
      : clients.find((client) => clientDisplayName(client).trim().toLowerCase() === linkedClientName);

    const invoiceWithClient = matchedClient
      ? {
          ...linked,
          client: clientDisplayName(matchedClient),
          client_id: matchedClient.id,
          client_name: clientDisplayName(matchedClient),
          client_email: matchedClient.email ?? linked.client_email ?? "",
          client_company: matchedClient.company || clientDisplayName(matchedClient),
        }
      : linked;

    const linkedOrderName = invoiceOrderName(invoiceWithClient).trim().toLowerCase();
    const matchingOrders = orders.filter((order) => orderMatchesClient(order, invoiceWithClient.client_id, invoiceClientName(invoiceWithClient)));
    const matchedOrder = invoiceWithClient.order_id
      ? orders.find((order) => order.id === invoiceWithClient.order_id)
      : matchingOrders.find((order) => orderDisplayName(order).trim().toLowerCase() === linkedOrderName);

    if (!matchedOrder) return normalizeInvoice(invoiceWithClient);

    return normalizeInvoice({
      ...invoiceWithClient,
      orderName: orderDisplayName(matchedOrder),
      order_id: matchedOrder.id,
      order_name: orderDisplayName(matchedOrder),
    });
  };

  const openEditInvoice = (invoice: Invoice) => {
    setClientDropdownOpen(false);
    setOrderDropdownOpen(false);
    editSave.resetSaveState();
    setEditInvoice(hydrateInvoiceLinks(invoice));
  };

  useEffect(() => {
    if (!showModal || !form.client_id || form.order_id) return;

    const matchingOrders = orders.filter((order) => orderMatchesClient(order, form.client_id, form.client_name || form.client));
    if (matchingOrders.length !== 1) return;

    const timeout = window.setTimeout(() => {
      setForm((current) => {
        if (current.client_id !== form.client_id || current.order_id) return current;
        return applyOrderToInvoice(current, matchingOrders[0]);
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [form.client, form.client_id, form.client_name, form.order_id, orders, showModal]);

  const handleAdd = async () => {
    const linkedForm = normalizeInvoice(form);
    if (!linkedForm.client_name.trim()) {
      setFormError("Client is required.");
      return;
    }
    setFormError("");
    const newInvoice = { id: "invoice-" + Date.now(), ...linkedForm };
    await addSave.runSave(async () => {
      const response = await upsertItem(newInvoice);
      if (!response.error) {
        await syncInvoiceToOrder(newInvoice);
        setForm(emptyForm);
        setClientDropdownOpen(false);
        setOrderDropdownOpen(false);
      }
      return response;
    }, () => { setShowModal(false); setFormError(""); setClientDropdownOpen(false); setOrderDropdownOpen(false); });
  };

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    const linkedInvoice = normalizeInvoice(editInvoice);
    if (!invoiceClientName(linkedInvoice).trim()) {
      setFormError("Client is required.");
      return;
    }
    setFormError("");
    await editSave.runSave(async () => {
      const response = await upsertItem(linkedInvoice);
      if (!response.error) await syncInvoiceToOrder(linkedInvoice);
      return response;
    }, () => { setEditInvoice(null); setFormError(""); setClientDropdownOpen(false); setOrderDropdownOpen(false); });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    setDeletingId(id);
    await deleteItem(id);
    setDeletingId("");
    setEditInvoice(null);
  };

  const openAddModal = () => {
    setForm(emptyForm);
    setFormError("");
    addSave.resetSaveState();
    setClientDropdownOpen(false);
    setOrderDropdownOpen(false);
    setShowModal(true);
  };

  const renderFields = (
    data: InvoiceFields,
    onChange: (next: InvoiceFields) => void,
  ) => {
    const clientQuery = invoiceClientName(data).trim().toLowerCase();
    const clientSuggestions = clients
      .filter((client) => {
        const searchable = [clientDisplayName(client), client.email, client.company, client.contact].join(" ").toLowerCase();
        return !clientQuery || searchable.includes(clientQuery);
      })
      .slice(0, 8);

    const matchingOrders = orders.filter((order) => orderMatchesClient(order, data.client_id, invoiceClientName(data)));
    const orderQuery = invoiceOrderName(data).trim().toLowerCase();
    const orderSuggestions = matchingOrders
      .filter((order) => !orderQuery || orderDisplayName(order).toLowerCase().includes(orderQuery))
      .slice(0, 8);
    const orderDisabled = !data.client_id;

    const selectClient = (client: Client) => {
      const linkedClient = applyClientToInvoice(data, client);
      const clientOrders = orders.filter((order) => orderMatchesClient(order, client.id, clientDisplayName(client)));
      onChange(clientOrders.length === 1 ? applyOrderToInvoice(linkedClient, clientOrders[0]) : linkedClient);
      setClientDropdownOpen(false);
      setOrderDropdownOpen(clientOrders.length !== 1);
    };

    const selectOrder = (order: Order) => {
      onChange(applyOrderToInvoice(data, order));
      setOrderDropdownOpen(false);
    };

    return (
    <div className="space-y-4">
      <div className="relative">
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Client</label>
        <input
          type="text"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          placeholder="Search clients..."
          value={invoiceClientName(data)}
          onFocus={() => {
            setClientDropdownOpen(true);
            void reloadClients();
          }}
          onBlur={() => window.setTimeout(() => setClientDropdownOpen(false), 140)}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...data,
              client: value,
              client_id: "",
              client_name: value,
              client_email: "",
              client_company: "",
              orderName: "",
              order_id: "",
              order_name: "",
            });
            setClientDropdownOpen(true);
          }}
        />
        {clientDropdownOpen && clientSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
            {clientSuggestions.map((client) => (
              <button
                key={client.id}
                type="button"
                className="block w-full px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectClient(client);
                }}
              >
                <span className="block text-slate-950">{clientDisplayName(client)}</span>
                {(client.email || client.contact) && <span className="mt-0.5 block text-xs font-normal text-slate-500">{client.email || client.contact}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Order name</label>
        <input
          type="text"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
          placeholder={orderDisabled ? "Select a client first" : "Search client orders..."}
          value={invoiceOrderName(data)}
          disabled={orderDisabled}
          onFocus={() => setOrderDropdownOpen(true)}
          onBlur={() => window.setTimeout(() => setOrderDropdownOpen(false), 140)}
          onChange={(event) => {
            const value = event.target.value;
            onChange({ ...data, orderName: value, order_id: "", order_name: value });
            setOrderDropdownOpen(true);
          }}
        />
        {orderDropdownOpen && !orderDisabled && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
            {orderSuggestions.length > 0 ? (
              orderSuggestions.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="block w-full px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectOrder(order);
                  }}
                >
                  <span className="block text-slate-950">{orderDisplayName(order)}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{currencyInputValue(order.amount)} · {order.status}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-xs md:text-sm text-slate-500">No orders found for this client.</div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Total amount</label>
        <input
          type="text"
          inputMode="numeric"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={currencyInputValue(data.total_amount)}
          onChange={(event) => onChange(updateInvoiceTotal(data, currencyInputNumber(event.target.value)))}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Deposit amount</label>
        <input
          type="text"
          inputMode="numeric"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={currencyInputValue(data.deposit_amount)}
          onChange={(event) => onChange(updateInvoiceDeposit(data, currencyInputNumber(event.target.value)))}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(data.deposit_paid)}
            onChange={(event) => {
              const checked = event.target.checked;
              onChange(normalizeInvoiceFinancials({
                ...data,
                deposit_paid: checked,
                deposit_paid_date: checked ? (data.deposit_paid_date || todayDate()) : "",
              }));
            }}
          />
          Deposit paid
        </label>
        <div>
          <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Deposit paid date</label>
          <input
            type="date"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            value={data.deposit_paid_date || ""}
            disabled={!data.deposit_paid}
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, deposit_paid_date: event.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Balance remaining</label>
        <input
          type="text"
          className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-xs md:text-sm text-slate-700 md:text-sm"
          value={currencyInputValue(data.balance_remaining)}
          readOnly
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Final due date</label>
        <input
          type="date"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={data.final_due_date || ""}
          onClick={(event) => event.currentTarget.showPicker?.()}
          onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_due_date: event.target.value, dueDate: event.target.value }))}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(data.final_paid)}
            onChange={(event) => {
              const checked = event.target.checked;
              onChange(normalizeInvoiceFinancials({
                ...data,
                final_paid: checked,
                final_paid_date: checked ? (data.final_paid_date || todayDate()) : "",
              }));
            }}
          />
          Final paid
        </label>
        <div>
          <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Final paid date</label>
          <input
            type="date"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            value={data.final_paid_date || ""}
            disabled={!data.final_paid}
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_paid_date: event.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</label>
        <select
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm"
          value={normalizeInvoiceStatus(data.status)}
          onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, status: event.target.value as InvoiceStatus }))}
        >
          {invoiceStatusOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
        <textarea
          rows={3}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          placeholder="Payment details, notes, reminders..."
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
  };

  if (loading) return <LoadingState label="Loading finances..." />;

  return (
    <div className="space-y-7 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Finances</p>
          <h1 className="mt-3 text-base md:text-xl font-semibold text-slate-950 md:text-3xl">Revenue & invoices</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search invoices..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="min-h-11 w-full rounded-3xl bg-slate-900 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800 md:w-auto" onClick={openAddModal}>
            Add invoice
          </button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Revenue Collected", value: currency.format(revenueCollected), trend: "up" },
          { label: "Outstanding Balance", value: currency.format(outstandingBalance), trend: outstandingBalance > 0 ? "down" : "up" },
          { label: "Total Invoice Value", value: currency.format(totalInvoiceValue), trend: "up" },
          { label: "Overdue Count", value: overdueCount.toString(), trend: overdueCount > 0 ? "down" : "up" },
        ].map((card) => {
          const TrendIcon = card.trend === "up" ? TrendingUp : TrendingDown;
          return (
            <div key={card.label} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-bold tracking-tight text-slate-950 md:text-3xl">{card.value}</p>
                  <p className="mt-2 text-xs md:text-sm text-slate-600">{card.label}</p>
                </div>
                <span className={`rounded-2xl p-2 ${card.label === "Overdue Count" || card.trend === "down" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                  <TrendIcon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-slate-950">Revenue over time</h2>
              <p className="mt-1 text-xs md:text-sm text-slate-600">Monthly collected revenue and projected outstanding balance.</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyRevenue} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="outstandingFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => `$${Number(value) / 1000}k`} width={44} />
                <Tooltip formatter={(value) => currency.format(Number(value ?? 0))} contentStyle={{ borderRadius: 16, borderColor: "#e2e8f0" }} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={3} fill="url(#collectedFill)" dot={false} activeDot={false} />
                <Area type="monotone" dataKey="outstanding" name="Outstanding" stroke="#f59e0b" strokeWidth={3} fill="url(#outstandingFill)" dot={false} activeDot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-base md:text-lg font-semibold text-slate-950">Invoice status breakdown</h2>
          <div className="relative mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={74} outerRadius={104} paddingAngle={4} strokeWidth={0}>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={statusPalette[entry.name as InvoiceStatus]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-base md:text-3xl font-bold text-slate-950">{normalizedInvoices.length}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">Invoices</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {statusData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-xs md:text-sm text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusPalette[item.name as InvoiceStatus] }} aria-hidden="true" />
                <span>{item.name}</span>
                <span className="ml-auto font-semibold text-slate-950">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-950">Invoices</h2>
            <p className="mt-1 text-xs md:text-sm text-slate-600">Click any row to edit invoice details.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm text-slate-900"
              value={filter}
              onChange={(e) => setFilter(e.target.value as InvoiceStatus | "All")}
            >
              <option>All</option>
              {invoiceStatusOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
            <button className="min-h-11 rounded-3xl bg-slate-900 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800" onClick={openAddModal}>
              Add invoice
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((invoice) => (
            <article
              key={invoice.id}
              role="button"
              tabIndex={0}
              className="rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md md:p-5"
              onClick={() => openEditInvoice(invoice)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEditInvoice(invoice);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-500 md:text-sm">{invoiceClientName(invoice)}</p>
                  <h3 className="mt-1 truncate text-base font-semibold text-slate-950 md:text-lg">{invoiceOrderName(invoice) || "Untitled invoice"}</h3>
                </div>
                <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] " + statusColors[invoice.status]}>
                  {invoice.status}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-slate-600 md:text-sm">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                  <span>Total amount</span>
                  <span className="font-semibold text-slate-950">{currencyInputValue(invoice.total_amount)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                  <span>Deposit</span>
                  <span className={invoice.deposit_paid ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                    {invoice.deposit_paid ? "Paid" : "Due"} · {currencyInputValue(invoice.deposit_amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                  <span>Balance remaining</span>
                  <span className="font-semibold text-slate-950">{currencyInputValue(invoice.balance_remaining)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                  <span>Final payment</span>
                  <span className={invoice.final_paid ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                    {invoice.final_paid ? "Paid" : "Open"}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">{invoice.final_due_date ? "Due " + invoice.final_due_date : "No final due date"}</span>
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:min-h-10 md:min-w-10"
                  disabled={deletingId === invoice.id}
                  aria-label={"Delete " + invoiceOrderName(invoice)}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(invoice.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
          {visible.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 md:col-span-2 md:text-sm xl:col-span-3">
              No invoices found.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-950">Revenue goal</h2>
            <p className="mt-1 text-xs md:text-sm text-slate-600">{currency.format(revenueCollected)} of {currency.format(goal)} goal</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-base md:text-2xl font-bold text-slate-950">{goalPercent}%</p>
            <p className="text-xs md:text-sm text-slate-600">Projected completion: {projectedCompletion}</p>
          </div>
        </div>
        <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${goalPercent}%` }} />
        </div>
      </section>

      {showModal && (
        <ModalShell
          title="Add invoice"
          onClose={() => { setShowModal(false); setForm(emptyForm); setFormError(""); setClientDropdownOpen(false); setOrderDropdownOpen(false); }}
          maxWidth="max-w-md"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex gap-3">
                <SaveButton state={addSave.saveState} onClick={handleAdd} mode="add" className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setShowModal(false); setForm(emptyForm); setFormError(""); setClientDropdownOpen(false); setOrderDropdownOpen(false); }}>
                  Cancel
                </button>
              </div>
            </div>
          }
        >
            {renderFields(form, (next) => setForm(next as typeof emptyForm))}
        </ModalShell>
      )}

      {editInvoice && (
        <ModalShell
          title="Edit invoice"
          onClose={() => { setEditInvoice(null); setFormError(""); editSave.resetSaveState(); setClientDropdownOpen(false); setOrderDropdownOpen(false); }}
          maxWidth="max-w-md"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex gap-3">
                <SaveButton state={editSave.saveState} onClick={handleSaveEdit} className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setEditInvoice(null); setFormError(""); editSave.resetSaveState(); setClientDropdownOpen(false); setOrderDropdownOpen(false); }}>
                  Cancel
                </button>
              </div>
              <button type="button" className="min-h-11 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs md:text-sm font-semibold text-rose-700 hover:bg-rose-100" disabled={deletingId === editInvoice.id} onClick={() => handleDelete(editInvoice.id)}>
                Delete invoice
              </button>
            </div>
          }
        >
            {renderFields(editInvoice, (next) => setEditInvoice(next as Invoice))}
        </ModalShell>
      )}
    </div>
  );
}
