"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Link2, Pencil, Receipt, Search, Send, Trash2 } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import SendReceiptModal from "@/components/SendReceiptModal";
import SendFinalInvoiceModal from "@/components/SendFinalInvoiceModal";
import { PAYMENT_METHOD_OPTIONS, resolveReceipt, fmtReceiptDate } from "@/lib/receipt";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { businessTodayISO } from "@/lib/businessDate";
import { INVOICE_STATUS_OPTIONS, type InvoiceStatus } from "@/lib/constants";
import { calcBalance, calcCollected, calcDeposit, calcTotal, parseAmount } from "@/lib/invoiceCalc";
import { calcDepositTax, fmtTaxRate, salesTaxRate } from "@/lib/salesTax";
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
  lead_id?: string;
  amount?: string | number;
  total_amount: string | number;
  deposit_amount: string | number;
  deposit_paid: boolean;
  deposit_paid_date?: string;
  deposit_payment_method?: string | null;
  deposit_receipt_sent_at?: string;
  balance_remaining: string | number;
  final_due_date?: string;
  final_paid: boolean;
  final_paid_date?: string;
  final_payment_method?: string | null;
  final_receipt_sent_at?: string;
  final_invoice_sent_at?: string;
  dueDate?: string;
  status: InvoiceStatus;
  notes: string;
  stripe_invoice_url?: string;
  public_token?: string;
  public_link?: string;
  subtotal?: number;
  discount?: unknown;
  sales_tax_rate?: number;
  sales_tax_amount?: number;
  grand_total?: number;
  tax_collected_amount?: number;
};

type SalesTaxPayment = {
  id: string;
  // New format fields (written by the enhanced form)
  payment_date?: string;
  period_start?: string;
  period_end?: string;
  amount_cents?: number;
  paid_by?: string;
  confirmation_number?: string;
  notes?: string;
  created_at?: string;
  // Old format fields — kept for backward compat with existing records
  amount?: number;
  date?: string;
  period?: string;
};

/** Canonical dollar amount — handles both new (amount_cents) and old (amount) records. */
function taxPaymentDollars(p: SalesTaxPayment): number {
  if (p.amount_cents != null) return p.amount_cents / 100;
  return parseAmount(p.amount ?? 0);
}

/** Canonical payment date — handles both new (payment_date) and old (date) records. */
function taxPaymentDateStr(p: SalesTaxPayment): string {
  return p.payment_date ?? p.date ?? "";
}

/** Quarter number (1–4) for an ISO date string within a given year string, or null. */
function dateToQuarter(dateStr: string | undefined, year: string): number | null {
  if (!dateStr?.startsWith(year)) return null;
  const m = parseInt(dateStr.slice(5, 7), 10);
  if (m <= 3) return 1;
  if (m <= 6) return 2;
  if (m <= 9) return 3;
  return 4;
}

/** Which quarter a tax payment covers for the given year.
 *  Checks period_start first, then payment date, then parses the period text label. */
function taxPaymentQuarter(p: SalesTaxPayment, year: string): number | null {
  const q1 = dateToQuarter(p.period_start, year);
  if (q1) return q1;
  const q2 = dateToQuarter(taxPaymentDateStr(p), year);
  if (q2) return q2;
  const label = p.period ?? "";
  if (label.includes(year) || !label.match(/\d{4}/)) {
    const m = label.match(/Q([1-4])/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

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
  stripe_invoice_url?: string;
  vendor_cost_cents?: number;
  vendor_payment_status?: string;
};

// ── Expense types and constants ──────────────────────────────────────────────

type ExpensePaymentStatus = "paid" | "unpaid";
type ExpenseReimbursementStatus = "not_needed" | "needs_reimbursement" | "reimbursed";

type Expense = {
  id: string;
  expense_date: string;
  vendor_name: string;
  category: string;
  amount_cents: number;
  paid_by: string;
  payment_status: ExpensePaymentStatus;
  reimbursement_status: ExpenseReimbursementStatus;
  notes?: string;
  related_order_id?: string;
  receipt_url?: string;
  created_at?: string;
  updated_at?: string;
};

const EXPENSE_CATEGORIES = [
  "Materials",
  "Packaging",
  "Tools",
  "Software",
  "Samples",
  "Supplies",
  "Shipping",
  "Other",
] as const;

const EXPENSE_PAID_BY_OPTIONS = ["Alliyah", "Hannah", "Jordan", "Company Account"] as const;

const EXPENSE_REIMBURSEMENT_LABELS: Record<ExpenseReimbursementStatus, string> = {
  not_needed: "Not needed",
  needs_reimbursement: "Needs reimbursement",
  reimbursed: "Reimbursed",
};

const emptyExpenseForm = {
  expense_date: "",
  vendor_name: "",
  category: "",
  amountStr: "",
  paid_by: "",
  payment_status: "unpaid" as ExpensePaymentStatus,
  reimbursement_status: "not_needed" as ExpenseReimbursementStatus,
  notes: "",
  receipt_url: "",
  related_order_id: "",
};

function formatExpenseDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function expenseCategoryBadgeClass(category: string): string {
  const map: Record<string, string> = {
    Materials: "bg-blue-100 text-blue-700",
    Packaging: "bg-purple-100 text-purple-700",
    Tools: "bg-orange-100 text-orange-700",
    Software: "bg-indigo-100 text-indigo-700",
    Samples: "bg-teal-100 text-teal-700",
    Supplies: "bg-amber-100 text-amber-700",
    Shipping: "bg-cyan-100 text-cyan-700",
    Other: "bg-slate-100 text-slate-600",
  };
  return map[category] ?? "bg-slate-100 text-slate-600";
}

// ─────────────────────────────────────────────────────────────────────────────

const invoiceStatusOptions = INVOICE_STATUS_OPTIONS;
const emptyForm = { client: "", orderName: "", client_id: "", client_name: "", client_email: "", client_company: "", order_id: "", order_name: "", amount: 0, total_amount: 0, deposit_amount: 0, deposit_paid: false, deposit_paid_date: "", deposit_payment_method: "", balance_remaining: 0, final_due_date: "", final_paid: false, final_paid_date: "", final_payment_method: "", dueDate: "", status: "Draft" as InvoiceStatus, notes: "", stripe_invoice_url: "" };
type InvoiceFields = Invoice | typeof emptyForm;

type FinanceTab = "overview" | "invoices" | "expenses" | "sales-tax";
const FINANCE_TABS: { value: FinanceTab; label: string }[] = [
  { value: "overview",   label: "Overview"   },
  { value: "invoices",   label: "Invoices"   },
  { value: "expenses",   label: "Expenses"   },
  { value: "sales-tax",  label: "Sales Tax"  },
];
function isFinanceTab(v: string | null): v is FinanceTab {
  return FINANCE_TABS.some((t) => t.value === v);
}

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

// A balance counts as "owed now" only once the final invoice has been SENT and not yet
// paid. A deposit-paid invoice whose final invoice hasn't gone out is upcoming, not owed.
function invoiceOwedNow(invoice: Invoice) {
  return Boolean(invoice.final_invoice_sent_at) && !invoice.final_paid;
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
  return businessTodayISO();
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

function FinancesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: invoices, upsertItem, deleteItem, loading, error } = useSupabaseTable<Invoice>("finances", []);
  const { data: clients, reload: reloadClients } = useSupabaseTable<Client>("clients", []);
  const { data: orders, upsertItem: upsertOrder } = useSupabaseTable<Order>("orders", []);
  const { data: taxPayments, upsertItem: upsertTaxPayment, deleteItem: deleteTaxPayment } = useSupabaseTable<SalesTaxPayment>("sales_tax_payments", []);
  const { data: expenses, upsertItem: upsertExpense, deleteItem: deleteExpense, error: expensesError } = useSupabaseTable<Expense>("expenses", []);
  // Read-only: used to resolve a lead email fallback for receipts (same source /api/invoice/generate uses)
  // and to detect stale (superseded-quote) deposit requests below.
  const { data: leads } = useSupabaseTable<{ id: string; email?: string; quote_id?: string; contact?: string }>("crm_leads", []);
  // Read-only retro-scan: flags deposit requests left stale by a quote revision that
  // predates the supersede/void feature. Detect only — never auto-voids.
  const { data: depositRequests } = useSupabaseTable<{ id: string; lead_id?: string; quote_id?: string; status?: string; voided_at?: string; grand_total?: number | string; deposit_request_number?: string; client_payment_method_intent?: string }>("deposit_requests", []);
  const { data: quotesForScan } = useSupabaseTable<{ id: string; grand_total?: number | string }>("quotes", []);
  // The audit's stale-deposit query, computed read-only: an unpaid, un-voided deposit
  // whose lead has repointed to a newer quote, or whose stored total no longer matches
  // the lead's current quote total.
  const staleDeposits = useMemo(() => {
    const toNum = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const quoteById = new Map(quotesForScan.map((q) => [q.id, q]));
    return depositRequests.filter((d) => {
      const status = d.status ?? "";
      if (status === "paid" || status === "pending" || d.voided_at) return false;
      const lead = d.lead_id ? leadById.get(d.lead_id) : undefined;
      if (!lead || !lead.quote_id) return false;
      if (d.quote_id && d.quote_id !== lead.quote_id) return true;
      const quote = quoteById.get(lead.quote_id);
      return quote != null && toNum(d.grand_total) !== toNum(quote.grand_total);
    });
  }, [depositRequests, leads, quotesForScan]);
  const [filter, setFilter] = useState<InvoiceStatus | "All" | "Unpaid">(() => {
    const p = searchParams.get("filter") ?? "";
    if (p.toLowerCase() === "unpaid") return "Unpaid";
    if ((invoiceStatusOptions as string[]).includes(p)) return p as InvoiceStatus;
    return "All";
  });
  const [activeTab, setActiveTab] = useState<FinanceTab>(() => {
    // ?invoice= and ?filter= always land on Invoices tab
    if (searchParams.get("invoice") || searchParams.get("filter")) return "invoices";
    const t = searchParams.get("tab");
    return isFinanceTab(t) ? t : "overview";
  });
  const [query, setQuery] = useState("");
  const invoiceParamId = searchParams.get("invoice");
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);
  const [receiptPhase, setReceiptPhase] = useState<"deposit" | "final" | null>(null);
  const [sendInvoiceTarget, setSendInvoiceTarget] = useState<Invoice | null>(null);
  const addSave = useSaveState();
  const editSave = useSaveState();
  const [form, setForm] = useState(emptyForm);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  // Expense state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [expenseFormError, setExpenseFormError] = useState("");
  const [deletingExpenseId, setDeletingExpenseId] = useState("");
  const [expenseFilter, setExpenseFilter] = useState({ status: "all", paidBy: "", category: "" });
  const expenseSave = useSaveState();
  // Sales tax state
  const currentYear = new Date().getFullYear().toString();
  const [selectedTaxYear, setSelectedTaxYear] = useState(currentYear);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [editingTaxPayment, setEditingTaxPayment] = useState<SalesTaxPayment | null>(null);
  const [taxForm, setTaxForm] = useState({ payment_date: businessTodayISO(), period_label: "", amount: "", paid_by: "", confirmation_number: "", notes: "" });
  const [taxFormError, setTaxFormError] = useState("");
  const taxSave = useSaveState();
  const normalizedInvoices = useMemo(() => invoices.map((invoice) => normalizeInvoice(invoice)), [invoices]);

  const updateTab = (next: FinanceTab) => {
    setActiveTab(next);
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", next);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // Keep activeTab in sync when ?invoice= or ?filter= params arrive (e.g. from order page deep-link)
  const invoiceParamForEffect = searchParams.get("invoice");
  const filterParamForEffect  = searchParams.get("filter");
  useEffect(() => {
    if (invoiceParamForEffect || filterParamForEffect) setActiveTab("invoices");
  }, [invoiceParamForEffect, filterParamForEffect]);

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
      stripe_invoice_url: invoice.stripe_invoice_url ?? order.stripe_invoice_url ?? "",
    });
  };

  const visible = normalizedInvoices
    .filter((invoice) => {
      if (filter === "All") return true;
      if (filter === "Unpaid") return invoice.status !== "Paid in Full" && invoice.status !== "Cancelled";
      return invoice.status === filter;
    })
    .filter((invoice) => Object.values(invoice).join(" ").toLowerCase().includes(query.toLowerCase()));

  const revenueCollected = normalizedInvoices.reduce((sum, invoice) => sum + invoiceCollected(invoice), 0);
  // Owed-now = final invoice SENT and not yet paid. A deposit-paid invoice whose final
  // invoice hasn't gone out is upcoming, so its balance is NOT summed into Outstanding.
  const outstandingBalance = normalizedInvoices
    .filter((invoice) => invoiceOwedNow(invoice))
    .reduce((sum, invoice) => sum + invoiceBalance(invoice), 0);
  const totalInvoiceValue = normalizedInvoices
    .filter((invoice) => invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const overdueCount = normalizedInvoices.filter((invoice) => invoice.status === "Overdue").length;

  // ── Vendor cost metrics ──────────────────────────────────────────────────────
  // Only non-cancelled orders. Missing vendor_cost_cents treated as 0.
  // Missing vendor_payment_status treated as "unpaid" (conservative).
  const activeOrders = orders.filter((o) => (o.status as string).toLowerCase() !== "cancelled");
  const totalVendorCosts = activeOrders.reduce((sum, o) => sum + (o.vendor_cost_cents ?? 0) / 100, 0);
  const unpaidVendorCosts = activeOrders
    .filter((o) => (o.vendor_payment_status ?? "unpaid") !== "paid")
    .reduce((sum, o) => sum + (o.vendor_cost_cents ?? 0) / 100, 0);
  const paidVendorCosts = totalVendorCosts - unpaidVendorCosts;
  const estimatedGrossProfit = revenueCollected - paidVendorCosts;
  const ordersWithoutVendorCost = activeOrders.filter((o) => !o.vendor_cost_cents).length;

  // ── Sales tax metrics ────────────────────────────────────────────────────────
  const configuredTaxRate = salesTaxRate();

  const taxCollectedYTD = useMemo(() => {
    return normalizedInvoices.reduce((sum, inv) => {
      const taxAmt = parseAmount(inv.sales_tax_amount ?? 0);
      if (taxAmt <= 0) return sum;
      const grandTotalAmt = parseAmount(inv.grand_total ?? inv.total_amount);
      const depositAmt = parseAmount(inv.deposit_amount);
      if (inv.final_paid && inv.final_paid_date?.startsWith(currentYear)) {
        return sum + taxAmt;
      }
      if (inv.deposit_paid && inv.deposit_paid_date?.startsWith(currentYear) && !inv.final_paid) {
        return sum + calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
      }
      if (inv.final_paid && !inv.final_paid_date?.startsWith(currentYear) && inv.deposit_paid && inv.deposit_paid_date?.startsWith(currentYear)) {
        return sum + calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
      }
      return sum;
    }, 0);
  }, [normalizedInvoices, currentYear]);

  const taxPaidYTD = useMemo(() => {
    return taxPayments
      .filter((p) => taxPaymentDateStr(p).startsWith(currentYear))
      .reduce((sum, p) => sum + taxPaymentDollars(p), 0);
  }, [taxPayments, currentYear]);

  const taxDue = Math.max(taxCollectedYTD - taxPaidYTD, 0);

  // Warn if any paid invoices are missing sales_tax_amount — the YTD figure may undercount.
  const hasTaxGap = normalizedInvoices.some(
    (inv) => (inv.deposit_paid || inv.final_paid) && !parseAmount(inv.sales_tax_amount ?? 0),
  );

  // ── Per-year / quarterly tax metrics (driven by selectedTaxYear) ─────────
  const taxCollectedForYear = useMemo(() => {
    return normalizedInvoices.reduce((sum, inv) => {
      const taxAmt = parseAmount(inv.sales_tax_amount ?? 0);
      if (taxAmt <= 0) return sum;
      const grandTotalAmt = parseAmount(inv.grand_total ?? inv.total_amount);
      const depositAmt = parseAmount(inv.deposit_amount);
      if (inv.final_paid && inv.final_paid_date?.startsWith(selectedTaxYear)) {
        return sum + taxAmt;
      }
      if (inv.deposit_paid && inv.deposit_paid_date?.startsWith(selectedTaxYear) && !inv.final_paid) {
        return sum + calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
      }
      if (inv.final_paid && !inv.final_paid_date?.startsWith(selectedTaxYear) && inv.deposit_paid && inv.deposit_paid_date?.startsWith(selectedTaxYear)) {
        return sum + calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
      }
      return sum;
    }, 0);
  }, [normalizedInvoices, selectedTaxYear]);

  const taxPaidForYear = useMemo(() => {
    return taxPayments
      .filter((p) => taxPaymentDateStr(p).startsWith(selectedTaxYear))
      .reduce((sum, p) => sum + taxPaymentDollars(p), 0);
  }, [taxPayments, selectedTaxYear]);

  const taxDueForYear = Math.max(taxCollectedForYear - taxPaidForYear, 0);

  const quarterlyTax = useMemo(() => {
    const quarters = [1, 2, 3, 4].map((q) => ({
      q,
      label: `Q${q}`,
      months: q === 1 ? "Jan–Mar" : q === 2 ? "Apr–Jun" : q === 3 ? "Jul–Sep" : "Oct–Dec",
      collected: 0,
      paid: 0,
    }));

    normalizedInvoices.forEach((inv) => {
      const taxAmt = parseAmount(inv.sales_tax_amount ?? 0);
      if (taxAmt <= 0) return;
      const grandTotalAmt = parseAmount(inv.grand_total ?? inv.total_amount);
      const depositAmt = parseAmount(inv.deposit_amount);
      const depositTax = calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
      const finalQ = dateToQuarter(inv.final_paid_date, selectedTaxYear);
      const depositQ = dateToQuarter(inv.deposit_paid_date, selectedTaxYear);

      if (finalQ && inv.final_paid) {
        if (depositQ && depositQ !== finalQ && inv.deposit_paid) {
          quarters[depositQ - 1].collected += depositTax;
          quarters[finalQ - 1].collected += taxAmt - depositTax;
        } else {
          quarters[finalQ - 1].collected += taxAmt;
        }
      } else if (depositQ && inv.deposit_paid && !inv.final_paid) {
        quarters[depositQ - 1].collected += depositTax;
      } else if (inv.final_paid && !finalQ && depositQ && inv.deposit_paid) {
        quarters[depositQ - 1].collected += depositTax;
      }
    });

    taxPayments.forEach((p) => {
      const q = taxPaymentQuarter(p, selectedTaxYear);
      if (q) quarters[q - 1].paid += taxPaymentDollars(p);
    });

    return quarters;
  }, [normalizedInvoices, taxPayments, selectedTaxYear]);

  const taxYearOptions = useMemo(() => {
    const years = new Set<string>([currentYear]);
    taxPayments.forEach((p) => {
      const d = taxPaymentDateStr(p);
      if (d.length >= 4) years.add(d.slice(0, 4));
    });
    normalizedInvoices.forEach((inv) => {
      if (inv.deposit_paid_date) years.add(inv.deposit_paid_date.slice(0, 4));
      if (inv.final_paid_date) years.add(inv.final_paid_date.slice(0, 4));
    });
    return [...years].filter((y) => /^\d{4}$/.test(y)).sort().reverse();
  }, [taxPayments, normalizedInvoices, currentYear]);

  // ── Expense metrics ────────────────────────────────────────────────────────
  // Paid = payment_status "paid". Missing fields default safely.
  // Reimbursed personal expenses are NOT double-counted — each expense is one record.
  const paidExpenses = expenses
    .filter((e) => e.payment_status === "paid")
    .reduce((sum, e) => sum + Math.round(e.amount_cents ?? 0) / 100, 0);
  const unpaidExpenses = expenses
    .filter((e) => e.payment_status !== "paid")
    .reduce((sum, e) => sum + Math.round(e.amount_cents ?? 0) / 100, 0);
  // Net Position = what's actually in the business after covering paid vendor costs + paid expenses
  const netPosition = revenueCollected - paidVendorCosts - paidExpenses;

  const visibleExpenses = expenses
    .filter((e) => {
      if (expenseFilter.status === "paid" && e.payment_status !== "paid") return false;
      if (expenseFilter.status === "unpaid" && e.payment_status !== "unpaid") return false;
      if (expenseFilter.paidBy && e.paid_by !== expenseFilter.paidBy) return false;
      if (expenseFilter.category && e.category !== expenseFilter.category) return false;
      return true;
    })
    .sort((a, b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? ""));

  const openAddTaxModal = () => {
    setEditingTaxPayment(null);
    setTaxForm({ payment_date: businessTodayISO(), period_label: "", amount: "", paid_by: "", confirmation_number: "", notes: "" });
    setTaxFormError("");
    taxSave.resetSaveState();
    setShowTaxModal(true);
  };

  const openEditTaxModal = (payment: SalesTaxPayment) => {
    setEditingTaxPayment(payment);
    setTaxForm({
      payment_date: taxPaymentDateStr(payment) || businessTodayISO(),
      period_label: payment.period ?? "",
      amount: taxPaymentDollars(payment) > 0 ? taxPaymentDollars(payment).toFixed(2) : "",
      paid_by: payment.paid_by ?? "",
      confirmation_number: payment.confirmation_number ?? "",
      notes: payment.notes ?? "",
    });
    setTaxFormError("");
    taxSave.resetSaveState();
    setShowTaxModal(true);
  };

  const closeTaxModal = () => {
    setShowTaxModal(false);
    setEditingTaxPayment(null);
    setTaxFormError("");
    taxSave.resetSaveState();
  };

  const handleSaveTaxPayment = async () => {
    const amt = parseFloat(taxForm.amount);
    if (!taxForm.amount || isNaN(amt) || amt <= 0) { setTaxFormError("Amount must be greater than $0."); return; }
    if (!taxForm.payment_date) { setTaxFormError("Date paid is required."); return; }
    setTaxFormError("");
    const cents = Math.round(amt * 100);
    const now = new Date().toISOString();
    if (editingTaxPayment) {
      const updated: SalesTaxPayment = {
        ...editingTaxPayment,
        payment_date: taxForm.payment_date,
        amount_cents: cents,
        paid_by: taxForm.paid_by || undefined,
        confirmation_number: taxForm.confirmation_number || undefined,
        notes: taxForm.notes || undefined,
        period: taxForm.period_label || undefined,
      };
      await taxSave.runSave(() => upsertTaxPayment(updated), closeTaxModal);
    } else {
      const newPayment: SalesTaxPayment = {
        id: `stp-${Date.now()}`,
        payment_date: taxForm.payment_date,
        amount_cents: cents,
        paid_by: taxForm.paid_by || undefined,
        confirmation_number: taxForm.confirmation_number || undefined,
        notes: taxForm.notes || undefined,
        period: taxForm.period_label || undefined,
        created_at: now,
      };
      await taxSave.runSave(() => upsertTaxPayment(newPayment), closeTaxModal);
    }
  };

  const handleDeleteTaxPayment = async (id: string) => {
    if (!window.confirm("Delete this tax payment record? This cannot be undone.")) return;
    await deleteTaxPayment(id);
    if (editingTaxPayment?.id === id) closeTaxModal();
  };

  const openAddExpenseModal = () => {
    setExpenseForm({ ...emptyExpenseForm, expense_date: businessTodayISO() });
    setEditingExpense(null);
    setExpenseFormError("");
    expenseSave.resetSaveState();
    setShowExpenseModal(true);
  };

  const openEditExpenseModal = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      expense_date: expense.expense_date ?? "",
      vendor_name: expense.vendor_name ?? "",
      category: expense.category ?? "",
      amountStr: (expense.amount_cents ?? 0) > 0 ? ((expense.amount_cents ?? 0) / 100).toFixed(2) : "",
      paid_by: expense.paid_by ?? "",
      payment_status: expense.payment_status ?? "unpaid",
      reimbursement_status: expense.reimbursement_status ?? "not_needed",
      notes: expense.notes ?? "",
      receipt_url: expense.receipt_url ?? "",
      related_order_id: expense.related_order_id ?? "",
    });
    setExpenseFormError("");
    expenseSave.resetSaveState();
    setShowExpenseModal(true);
  };

  const closeExpenseModal = () => {
    setShowExpenseModal(false);
    setEditingExpense(null);
    setExpenseFormError("");
    expenseSave.resetSaveState();
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.expense_date) { setExpenseFormError("Date is required."); return; }
    if (!expenseForm.vendor_name.trim()) { setExpenseFormError("Vendor / source is required."); return; }
    if (!expenseForm.category) { setExpenseFormError("Category is required."); return; }
    const parsed = parseFloat(expenseForm.amountStr);
    if (!expenseForm.amountStr || isNaN(parsed) || parsed <= 0) { setExpenseFormError("Amount must be greater than $0."); return; }
    if (!expenseForm.paid_by) { setExpenseFormError("Paid by is required."); return; }
    setExpenseFormError("");
    const cents = Math.round(parsed * 100);
    const now = new Date().toISOString();
    if (editingExpense) {
      const updated: Expense = {
        ...editingExpense,
        expense_date: expenseForm.expense_date,
        vendor_name: expenseForm.vendor_name.trim(),
        category: expenseForm.category,
        amount_cents: cents,
        paid_by: expenseForm.paid_by,
        payment_status: expenseForm.payment_status,
        reimbursement_status: expenseForm.reimbursement_status,
        notes: expenseForm.notes,
        receipt_url: expenseForm.receipt_url,
        related_order_id: expenseForm.related_order_id,
        updated_at: now,
      };
      await expenseSave.runSave(() => upsertExpense(updated), closeExpenseModal);
    } else {
      const newExp: Expense = {
        id: `expense-${Date.now()}`,
        expense_date: expenseForm.expense_date,
        vendor_name: expenseForm.vendor_name.trim(),
        category: expenseForm.category,
        amount_cents: cents,
        paid_by: expenseForm.paid_by,
        payment_status: expenseForm.payment_status,
        reimbursement_status: expenseForm.reimbursement_status,
        notes: expenseForm.notes,
        receipt_url: expenseForm.receipt_url,
        related_order_id: expenseForm.related_order_id,
        created_at: now,
        updated_at: now,
      };
      await expenseSave.runSave(() => upsertExpense(newExp), closeExpenseModal);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    setDeletingExpenseId(id);
    await deleteExpense(id);
    setDeletingExpenseId("");
    if (editingExpense?.id === id) closeExpenseModal();
  };

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

    // Prefill the deposit method from the client's declared intent when the finance
    // row has none yet (legacy rows created before the method was carried over).
    const invLinks = invoiceWithClient as Invoice & { deposit_request_id?: string; quote_id?: string };
    const matchedDeposit = depositRequests.find((d) =>
      (invLinks.deposit_request_id && d.id === invLinks.deposit_request_id) ||
      (invLinks.lead_id && d.lead_id === invLinks.lead_id) ||
      (invLinks.quote_id && d.quote_id === invLinks.quote_id),
    );
    const depositMethodPrefill = (!invLinks.deposit_payment_method && matchedDeposit?.client_payment_method_intent)
      ? { deposit_payment_method: matchedDeposit.client_payment_method_intent }
      : {};

    const linkedOrderName = invoiceOrderName(invoiceWithClient).trim().toLowerCase();
    const matchingOrders = orders.filter((order) => orderMatchesClient(order, invoiceWithClient.client_id, invoiceClientName(invoiceWithClient)));
    const matchedOrder = invoiceWithClient.order_id
      ? orders.find((order) => order.id === invoiceWithClient.order_id)
      : matchingOrders.find((order) => orderDisplayName(order).trim().toLowerCase() === linkedOrderName);

    if (!matchedOrder) return normalizeInvoice({ ...invoiceWithClient, ...depositMethodPrefill });

    return normalizeInvoice({
      ...invoiceWithClient,
      ...depositMethodPrefill,
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

  // Auto-open invoice when navigated here with ?invoice=<id> (e.g. from the order page quick actions).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || loading || !invoiceParamId || normalizedInvoices.length === 0) return;
    const target = normalizedInvoices.find((inv) => inv.id === invoiceParamId);
    if (!target) return;
    autoOpenedRef.current = true;
    openEditInvoice(target);
    // openEditInvoice is stable for this purpose; invoiceParamId never changes during a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, normalizedInvoices]);

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

  // Explicit "Send Receipt" flow. Persists the current edits (method/date) first so
  // the receipt reflects saved data, then opens the receipt modal.
  // phase forces which receipt to send WITHOUT changing what resolveReceipt computes:
  // "deposit" resolves against a final_paid:false COPY (deposit phase + deposit_receipt_sent_at);
  // "final"/undefined resolve against the real invoice. The stamp always lands on the real row.
  const resolvePhaseReceipt = (invoice: Invoice, phase?: "deposit" | "final") =>
    phase === "deposit" ? resolveReceipt({ ...invoice, final_paid: false }) : resolveReceipt(invoice);

  const handleOpenReceipt = async (phase?: "deposit" | "final") => {
    if (!editInvoice) return;
    const info = resolvePhaseReceipt(editInvoice, phase);
    if (!info) return;
    const alreadyAt = editInvoice[info.sentField] as string | undefined;
    if (alreadyAt && !window.confirm(`A receipt was already sent on ${fmtReceiptDate(alreadyAt)}. Send another receipt to the client?`)) return;
    const linked = normalizeInvoice(editInvoice);
    await upsertItem(linked);
    await syncInvoiceToOrder(linked);
    setReceiptInvoice(linked);
    setReceiptPhase(phase ?? null);
    setEditInvoice(null);
    setFormError("");
  };

  const handleReceiptSent = async (updated: Invoice) => {
    await upsertItem(updated);
    setReceiptInvoice(null);
  };

  const openSendFinalInvoice = (invoice: Invoice) => {
    setSendInvoiceTarget(invoice);
  };

  // Fires only after the final-invoice email actually sends (SendFinalInvoiceModal
  // success). Stamps final_invoice_sent_at on the finances row — this is what flips the
  // balance from "upcoming" to "owed now". Mirrors orders/[id]/page.tsx:1007. No money
  // math is touched and final_paid is NOT set.
  const handleFinalInvoiceSent = async () => {
    if (!sendInvoiceTarget) return;
    await upsertItem({ ...sendInvoiceTarget, final_invoice_sent_at: new Date().toISOString() });
  };

  // Lead email fallback (matches /api/invoice/generate). Empty string when none.
  const leadEmailFor = (inv: Invoice | null): string =>
    inv?.lead_id ? (leads.find((l) => l.id === inv.lead_id)?.email ?? "").trim() : "";

  // Contact person for the greeting (receipt email greets the person, not the company).
  const leadContactFor = (inv: Invoice | null): string =>
    inv?.lead_id ? (leads.find((l) => l.id === inv.lead_id)?.contact ?? "").trim() : "";

  // Deposit request number for the receipt reference line — matched from the loaded
  // deposit_requests by deposit_request_id, else lead_id, else quote_id.
  const depositNumberFor = (inv: Invoice | null): string => {
    if (!inv) return "";
    const rec = inv as Invoice & { deposit_request_id?: string; quote_id?: string };
    const d = depositRequests.find((x) =>
      (rec.deposit_request_id && x.id === rec.deposit_request_id) ||
      (rec.lead_id && x.lead_id === rec.lead_id) ||
      (rec.quote_id && x.quote_id === rec.quote_id),
    );
    return (d?.deposit_request_number ?? "").trim();
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
    variant: "add" | "edit" = "add",
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

    // ── EDIT VARIANT: wide two-column phase layout (desktop). Every input below keeps
    // its exact current write target; only the arrangement differs from the add layout. ──
    if (variant === "edit") {
      const inv = data as Invoice;
      const effectiveEmail = (data.client_email || "").trim() || leadEmailFor(inv);
      const finalSent = Boolean(inv.final_invoice_sent_at);
      const clientBlock = (
        <div className="relative">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Client</label>
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="Search clients..."
            value={invoiceClientName(data)}
            onFocus={() => { setClientDropdownOpen(true); void reloadClients(); }}
            onBlur={() => window.setTimeout(() => setClientDropdownOpen(false), 140)}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ ...data, client: value, client_id: "", client_name: value, client_email: "", client_company: "", orderName: "", order_id: "", order_name: "" });
              setClientDropdownOpen(true);
            }}
          />
          {data.client_id && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><Check className="h-3 w-3" aria-hidden="true" /> Connected to client record</p>
          )}
          {clientDropdownOpen && clientSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
              {clientSuggestions.map((client) => (
                <button key={client.id} type="button" className="block w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onMouseDown={(event) => { event.preventDefault(); selectClient(client); }}>
                  <span className="block text-slate-950">{clientDisplayName(client)}</span>
                  {(client.email || client.contact) && <span className="mt-0.5 block text-xs font-normal text-slate-500">{client.email || client.contact}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      );
      const orderBlock = (
        <div className="relative">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Order</label>
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            placeholder={orderDisabled ? "Select a client first" : "Search orders for this client..."}
            value={invoiceOrderName(data)}
            disabled={orderDisabled}
            onFocus={() => setOrderDropdownOpen(true)}
            onBlur={() => window.setTimeout(() => setOrderDropdownOpen(false), 140)}
            onChange={(event) => { const value = event.target.value; onChange({ ...data, orderName: value, order_id: "", order_name: value }); setOrderDropdownOpen(true); }}
          />
          {orderDropdownOpen && !orderDisabled && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
              {orderSuggestions.length > 0 ? (
                orderSuggestions.map((order) => (
                  <button key={order.id} type="button" className="block w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onMouseDown={(event) => { event.preventDefault(); selectOrder(order); }}>
                    <span className="block text-slate-950">{orderDisplayName(order)}</span>
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{currencyInputValue(order.amount)} · {order.status}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-xs text-slate-500 md:text-sm">No orders found for this client.</div>
              )}
            </div>
          )}
        </div>
      );
      const orderTotalBlock = (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Order total</label>
          <input type="text" inputMode="numeric" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={currencyInputValue(data.total_amount)} onChange={(event) => onChange(updateInvoiceTotal(data, currencyInputNumber(event.target.value)))} />
        </div>
      );
      const depositAmountBlock = (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Deposit</label>
          <input type="text" inputMode="numeric" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={currencyInputValue(data.deposit_amount)} onChange={(event) => onChange(updateInvoiceDeposit(data, currencyInputNumber(event.target.value)))} />
        </div>
      );
      const depositReceivedBlock = (
        <div className="grid gap-3">
          <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 md:text-sm">
            <input type="checkbox" checked={Boolean(data.deposit_paid)} onChange={(event) => { const checked = event.target.checked; onChange(normalizeInvoiceFinancials({ ...data, deposit_paid: checked, deposit_paid_date: checked ? (data.deposit_paid_date || todayDate()) : "" })); }} />
            Deposit received
          </label>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date received</label>
            <input type="date" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm" value={data.deposit_paid_date || ""} disabled={!data.deposit_paid} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, deposit_paid_date: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Deposit payment method</label>
            <select className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm" value={data.deposit_payment_method || ""} disabled={!data.deposit_paid} onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, deposit_payment_method: event.target.value }))}>
              <option value="">Not specified</option>
              {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      );
      const finalDueBlock = (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Final payment due</label>
          <input type="date" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={data.final_due_date || ""} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_due_date: event.target.value, dueDate: event.target.value }))} />
        </div>
      );
      const paidInFullBlock = (
        <div className="grid gap-3">
          <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 md:text-sm">
            <input type="checkbox" checked={Boolean(data.final_paid)} onChange={(event) => { const checked = event.target.checked; onChange(normalizeInvoiceFinancials({ ...data, final_paid: checked, final_paid_date: checked ? (data.final_paid_date || todayDate()) : "" })); }} />
            Paid in full
          </label>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date paid</label>
            <input type="date" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm" value={data.final_paid_date || ""} disabled={!data.final_paid} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_paid_date: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Final payment method</label>
            <select className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm" value={data.final_payment_method || ""} disabled={!data.final_paid} onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_payment_method: event.target.value }))}>
              <option value="">Not specified</option>
              {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      );
      const statusBlock = (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Invoice status</label>
          <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm" value={normalizeInvoiceStatus(data.status)} onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, status: event.target.value as InvoiceStatus }))}>
            {invoiceStatusOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>
      );
      const linkBlock = (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Invoice / Payment Link <span className="font-normal text-slate-400">(optional)</span></label>
          <input type="url" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm" placeholder="https://..." value={data.stripe_invoice_url ?? ""} onChange={(e) => onChange({ ...data, stripe_invoice_url: e.target.value })} />
        </div>
      );
      const notesBlock = (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes</label>
          <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" placeholder="Payment details, notes, reminders..." value={data.notes} onChange={(e) => onChange({ ...data, notes: e.target.value })} />
        </div>
      );

      return (
        <div className="space-y-5">
          {/* Eyebrow + linked-to-order confirmation */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            <span>Invoice</span>
            {data.order_id && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal text-emerald-600">
                <Link2 className="h-3 w-3" aria-hidden="true" /> Linked to order · syncs to client portal
              </span>
            )}
          </div>

          {/* Money summary strip */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100 md:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Order total</p>
              <p className="mt-1 text-sm font-bold text-slate-950 md:text-lg">{currency.format(calcTotal(data))}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100 md:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Collected</p>
              <p className="mt-1 text-sm font-bold text-emerald-700 md:text-lg">{currency.format(invoiceCollected(data))}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100 md:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Balance</p>
              <p className="mt-1 text-sm font-bold text-slate-950 md:text-lg">{currency.format(invoiceBalance(data))}</p>
            </div>
          </div>

          {/* Two-column: deposit | final (stacks on mobile) */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Deposit phase */}
            <div className={`rounded-2xl p-4 ring-1 md:p-5 ${data.deposit_paid ? "bg-emerald-50 ring-emerald-100" : "bg-white ring-slate-200"}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Deposit</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${data.deposit_paid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {data.deposit_paid ? `Paid${data.deposit_paid_date ? ` · ${data.deposit_paid_date}` : ""}` : "Not received"}
                </span>
              </div>
              <div className="space-y-3">
                {depositAmountBlock}
                {depositReceivedBlock}
              </div>
              <button type="button" disabled={!data.deposit_paid || !effectiveEmail} onClick={() => void handleOpenReceipt("deposit")} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40 disabled:hover:bg-emerald-50 md:text-sm">
                <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                {inv.deposit_receipt_sent_at ? "Resend deposit receipt" : "Send deposit receipt"}
              </button>
            </div>

            {/* Final phase */}
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Final payment</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${data.final_paid ? "bg-emerald-100 text-emerald-700" : finalSent ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  {data.final_paid ? "Paid" : finalSent ? "Sent · awaiting payment" : "Not sent yet"}
                </span>
              </div>
              {!data.final_paid && (
                <p className="mb-3 text-[11px] text-slate-500">
                  {finalSent ? `${currency.format(invoiceBalance(data))} owed` : `${currency.format(invoiceBalance(data))} · not owed until sent`}
                </p>
              )}
              <div className="space-y-3">
                {finalDueBlock}
                {paidInFullBlock}
              </div>
              {!data.final_paid ? (
                <button type="button" onClick={() => { openSendFinalInvoice(inv); setEditInvoice(null); }} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 md:text-sm">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Send final invoice
                </button>
              ) : (
                <button type="button" disabled={!effectiveEmail} onClick={() => void handleOpenReceipt("final")} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40 disabled:hover:bg-emerald-50 md:text-sm">
                  <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                  {inv.final_receipt_sent_at ? "Resend final receipt" : "Send final receipt"}
                </button>
              )}
            </div>
          </div>

          {/* Collapsed edit details — rarely-touched fields */}
          <details className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-600 md:text-sm">Edit details</summary>
            <div className="mt-4 space-y-4">
              {clientBlock}
              {orderBlock}
              {orderTotalBlock}
              {statusBlock}
              {linkBlock}
              {notesBlock}
            </div>
          </details>
        </div>
      );
    }

    return (
    <div className="space-y-4">
      {/* Client */}
      <div className="relative">
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Client</label>
        <input
          type="text"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
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
        {data.client_id && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><Check className="h-3 w-3" aria-hidden="true" /> Connected to client record</p>
        )}
        {clientDropdownOpen && clientSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
            {clientSuggestions.map((client) => (
              <button
                key={client.id}
                type="button"
                className="block w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
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

      {/* Order */}
      <div className="relative">
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Order</label>
        <input
          type="text"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
          placeholder={orderDisabled ? "Select a client first" : "Search orders for this client..."}
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
        {data.order_id && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><Check className="h-3 w-3" aria-hidden="true" /> Linked to order — payment data syncs to client portal</p>
        )}
        {orderDropdownOpen && !orderDisabled && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
            {orderSuggestions.length > 0 ? (
              orderSuggestions.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="block w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
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
              <div className="px-4 py-3 text-xs text-slate-500 md:text-sm">No orders found for this client.</div>
            )}
          </div>
        )}
      </div>

      {/* Amounts */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Order total</label>
        <input
          type="text"
          inputMode="numeric"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={currencyInputValue(data.total_amount)}
          onChange={(event) => onChange(updateInvoiceTotal(data, currencyInputNumber(event.target.value)))}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Deposit</label>
        <input
          type="text"
          inputMode="numeric"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={currencyInputValue(data.deposit_amount)}
          onChange={(event) => onChange(updateInvoiceDeposit(data, currencyInputNumber(event.target.value)))}
        />
      </div>

      {/* Balance due — computed, not editable */}
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs md:text-sm">
        <span className="font-semibold text-slate-600">Balance due</span>
        <span className={`font-semibold ${invoiceBalance(data) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
          {currencyInputValue(data.balance_remaining)}
        </span>
      </div>

      {/* Deposit received */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-300 px-4 py-3 text-xs font-semibold text-slate-700 md:text-sm">
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
          Deposit received
        </label>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date received</label>
          <input
            type="date"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            value={data.deposit_paid_date || ""}
            disabled={!data.deposit_paid}
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, deposit_paid_date: event.target.value }))}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Deposit payment method</label>
          <select
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            value={data.deposit_payment_method || ""}
            disabled={!data.deposit_paid}
            onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, deposit_payment_method: event.target.value }))}
          >
            <option value="">Not specified</option>
            {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Final payment due date */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Final payment due</label>
        <input
          type="date"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={data.final_due_date || ""}
          onClick={(event) => event.currentTarget.showPicker?.()}
          onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_due_date: event.target.value, dueDate: event.target.value }))}
        />
      </div>

      {/* Paid in full */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-300 px-4 py-3 text-xs font-semibold text-slate-700 md:text-sm">
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
          Paid in full
        </label>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date paid</label>
          <input
            type="date"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            value={data.final_paid_date || ""}
            disabled={!data.final_paid}
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_paid_date: event.target.value }))}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Final payment method</label>
          <select
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 md:text-sm"
            value={data.final_payment_method || ""}
            disabled={!data.final_paid}
            onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, final_payment_method: event.target.value }))}
          >
            <option value="">Not specified</option>
            {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Invoice status */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Invoice status</label>
        <select
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm"
          value={normalizeInvoiceStatus(data.status)}
          onChange={(event) => onChange(normalizeInvoiceFinancials({ ...data, status: event.target.value as InvoiceStatus }))}
        >
          {invoiceStatusOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      {/* Invoice / Payment Link */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">
          Invoice / Payment Link <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          type="url"
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
          placeholder="https://..."
          value={data.stripe_invoice_url ?? ""}
          onChange={(e) => onChange({ ...data, stripe_invoice_url: e.target.value })}
        />
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes</label>
        <textarea
          rows={3}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          placeholder="Payment details, notes, reminders..."
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );
  };

  // ── Tab badge counts ────────────────────────────────────────────────────────
  // Invoices: any invoice with an outstanding balance (not fully paid, not draft, not cancelled)
  const invoiceBadgeCount = normalizedInvoices.filter(
    (inv) => !inv.final_paid && inv.status !== "Cancelled" && inv.status !== "Draft",
  ).length;
  // Expenses: expenses where payment_status is "unpaid"
  const expenseBadgeCount = expenses.filter((e) => e.payment_status !== "paid").length;
  // Sales Tax: taxDue is already computed — badge shows only when tax is owed

  if (loading) return <LoadingState label="Loading finances..." />;

  // Display-only lists for the Overview "Needs Attention" block. Reuse existing helpers
  // and fields only (invoiceBalance / final_paid / status / reimbursement_status) — no
  // new money math, no renamed fields.
  const attentionInvoices = normalizedInvoices.filter(
    (inv) => !inv.final_paid && inv.status !== "Cancelled" && invoiceBalance(inv) > 0,
  );
  const openInvoiceCount = normalizedInvoices.filter(
    (inv) => !inv.final_paid && inv.status !== "Cancelled",
  ).length;
  const reimbursementExpenses = expenses.filter(
    (e) => e.reimbursement_status === "needs_reimbursement",
  );
  // Reimbursements owed (dollars) — inline sum over the same records, existing cents unit.
  const reimbursementsOwed = reimbursementExpenses.reduce((s, e) => s + (e.amount_cents ?? 0) / 100, 0);
  // "Who's owed what" — display-only grouping of needs_reimbursement expenses by paid_by.
  // Existing fields only (paid_by / amount_cents); no new field, nothing persisted or read
  // downstream. firstOwed just seeds the existing edit modal for a "Mark reimbursed" shortcut.
  const owedByPerson = EXPENSE_PAID_BY_OPTIONS.map((person) => {
    const owed = reimbursementExpenses.filter((e) => e.paid_by === person);
    return {
      person,
      amount: owed.reduce((s, e) => s + (e.amount_cents ?? 0) / 100, 0),
      count: owed.length,
      firstOwed: owed[0],
    };
  });
  // Current calendar quarter (1–4) within the selected tax year — DISPLAY-ONLY highlight.
  // Reuses the existing dateToQuarter helper; null when viewing a different year.
  const currentTaxQuarter = dateToQuarter(businessTodayISO(), selectedTaxYear);
  // Owed quarters (display-only) — derived from the existing quarterlyTax, same due rule.
  const owedTaxQuarters = quarterlyTax.filter((qt) => Math.max(qt.collected - qt.paid, 0) > 0);
  const nothingNeedsAttention =
    attentionInvoices.length === 0 && reimbursementExpenses.length === 0 && taxDue <= 0;

  // ── Invoices tab: display-only helpers (reuse existing fields; no new/renamed fields) ──
  const invoicesTodayISO = businessTodayISO();
  // Overdue is computed at DISPLAY TIME only — a final due date in the past with no final
  // payment. Never written; does NOT touch deriveInvoiceStatus or any status string.
  const isInvoiceOverdue = (inv: Invoice) =>
    Boolean(inv.final_due_date && !inv.final_paid && inv.final_due_date < invoicesTodayISO);
  const overdueDisplayCount = normalizedInvoices.filter(isInvoiceOverdue).length;
  const anyInvoiceOverdue = overdueDisplayCount > 0;
  // "Paid by check" — reads the existing method fields (deposit_payment_method / final_payment_method).
  const invoicePaidByCheck = (inv: Invoice) =>
    inv.deposit_payment_method === "check" || inv.final_payment_method === "check";
  // "Client will pay by check" — the matched deposit request's declared intent. Mirrors the
  // hydrateInvoiceLinks match predicate exactly (deposit_request_id | lead_id | quote_id).
  const invoiceWillPayByCheck = (inv: Invoice) => {
    const links = inv as Invoice & { deposit_request_id?: string; quote_id?: string };
    const dep = depositRequests.find((d) =>
      (links.deposit_request_id && d.id === links.deposit_request_id) ||
      (links.lead_id && d.lead_id === links.lead_id) ||
      (links.quote_id && d.quote_id === links.quote_id),
    );
    return dep?.client_payment_method_intent === "check";
  };

  return (
    <div className="space-y-7 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* Page header */}
      <div>
        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Finances</p>
        <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Finances</h1>
      </div>

      {/* Internal tab bar */}
      <div className="overflow-x-auto pb-1">
        <nav className="inline-flex w-fit min-w-max items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1" aria-label="Finance sections">
          {FINANCE_TABS.map((tab) => {
            const badge =
              tab.value === "invoices" ? invoiceBadgeCount
              : tab.value === "expenses" ? expenseBadgeCount
              : null;
            const hasTaxDot = tab.value === "sales-tax" && taxDue > 0;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => updateTab(tab.value)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition md:text-sm ${
                  activeTab === tab.value
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
                {badge != null && badge > 0 && (
                  <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
                    {badge}
                  </span>
                )}
                {hasTaxDot && (
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
      <>
      {/* Retro-scan: unpaid deposit requests whose lead has since moved to a newer
          quote (or whose stored total no longer matches the current quote). Flag
          only — the founder decides what to do; nothing is auto-voided. */}
      {staleDeposits.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 md:px-5 md:py-4">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 md:text-sm">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" /> {staleDeposits.length} deposit request{staleDeposits.length === 1 ? "" : "s"} may be out of date
          </p>
          <p className="mt-1 text-xs text-amber-700">
            The quote was revised after {staleDeposits.length === 1 ? "this request was" : "these requests were"} sent, so
            the old payment link could still bill the pre-revision amount. Review and re-send:{" "}
            <span className="font-semibold">
              {staleDeposits.map((d) => d.deposit_request_number || d.id).join(", ")}
            </span>.
          </p>
        </div>
      )}
      {/* ── Hero row: Net Position (health-reactive) + Collected + Outstanding ──── */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        {/* HERO — Net Position. Light slate normally; soft red when negative. Never dark. */}
        <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${netPosition < 0 ? "bg-rose-50 ring-1 ring-rose-100" : "bg-slate-50 ring-1 ring-slate-100"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Net Position</p>
          <p className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${netPosition < 0 ? "text-rose-600" : "text-slate-900"}`}>
            {currency.format(netPosition)}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-500">Revenue collected − all paid costs & expenses</p>
          <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${netPosition < 0 ? "bg-rose-100 text-rose-700" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {netPosition < 0 ? "In the red — startup costs" : "On track"}
          </span>
        </div>
        {/* Collected */}
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Collected</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{currency.format(revenueCollected)}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">of {currency.format(goal)} goal · {goalPercent}%</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${goalPercent}%` }} />
          </div>
        </div>
        {/* Outstanding */}
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Outstanding</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight md:text-3xl ${outstandingBalance > 0 ? "text-amber-600" : "text-slate-400"}`}>{currency.format(outstandingBalance)}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">across {openInvoiceCount} open invoice{openInvoiceCount !== 1 ? "s" : ""}</p>
          {overdueCount > 0 && (
            <span className="mt-3 inline-block rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700">{overdueCount} overdue</span>
          )}
        </div>
      </section>

      {/* ── Needs Attention — each item wires to a REAL handler ───────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs Attention</h2>
        {nothingNeedsAttention ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
            <p className="text-xs font-semibold text-emerald-800">All caught up — nothing needs attention.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attentionInvoices.map((inv) => {
              const owedNow = invoiceOwedNow(inv);
              const overdue = owedNow && inv.status === "Overdue";
              return (
                <div key={inv.id} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${overdue ? "bg-rose-50" : "bg-slate-50"}`}>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{invoiceOrderName(inv) || invoiceClientName(inv) || "Invoice"}</p>
                    <p className="truncate text-[10px] text-slate-400">
                      {invoiceClientName(inv) ? `${invoiceClientName(inv)} · ` : ""}
                      {owedNow
                        ? `balance ${currency.format(invoiceBalance(inv))}${overdue ? " · overdue" : ""}`
                        : `${currency.format(invoiceBalance(inv))} · Upcoming · not owed yet`}
                    </p>
                  </div>
                  {owedNow ? (
                    <button type="button" onClick={() => openEditInvoice(inv)} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">
                      Send receipt
                    </button>
                  ) : (
                    <button type="button" onClick={() => openSendFinalInvoice(inv)} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700">
                      Send final invoice
                    </button>
                  )}
                </div>
              );
            })}
            {taxDue > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">Sales tax owed</p>
                  <p className="truncate text-[10px] text-slate-400">{currency.format(taxDue)} collected but not yet remitted</p>
                </div>
                <button type="button" onClick={openAddTaxModal} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">
                  Record payment
                </button>
              </div>
            )}
            {reimbursementExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">Reimburse {e.vendor_name || e.category || "expense"}</p>
                  <p className="truncate text-[10px] text-slate-400">{currency.format((e.amount_cents ?? 0) / 100)}{e.paid_by ? ` · paid by ${e.paid_by}` : ""}</p>
                </div>
                <button type="button" onClick={() => openEditExpenseModal(e)} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">
                  Mark reimbursed
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── One clean money summary: Money In & Out / What's Owed ──────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
        <div className="grid gap-6 sm:grid-cols-2 sm:divide-x sm:divide-slate-100">
          {/* MONEY IN & OUT */}
          <div className="sm:pr-6">
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Money In &amp; Out</h3>
            <dl className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-600">Revenue collected</dt>
                <dd className="text-sm font-semibold text-emerald-600">{currency.format(revenueCollected)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-600">Production costs paid</dt>
                <dd className="text-sm font-semibold text-rose-500">−{currency.format(paidVendorCosts)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-600">Business expenses paid</dt>
                <dd className="text-sm font-semibold text-rose-500">−{currency.format(paidExpenses)}</dd>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
                <dt className="text-xs font-semibold text-slate-800">Net position</dt>
                <dd className={`text-base font-bold ${netPosition < 0 ? "text-rose-600" : "text-slate-900"}`}>{currency.format(netPosition)}</dd>
              </div>
            </dl>
          </div>
          {/* WHAT'S OWED */}
          <div className="sm:pl-6">
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">What&apos;s Owed</h3>
            <dl className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-600">Outstanding invoices</dt>
                <dd className={`text-sm font-semibold ${outstandingBalance > 0 ? "text-amber-600" : "text-slate-400"}`}>{currency.format(outstandingBalance)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-600">Sales tax to remit</dt>
                <dd className={`text-sm font-semibold ${taxDue > 0 ? "text-rose-600" : "text-slate-400"}`}>{currency.format(taxDue)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-slate-600">Reimbursements owed</dt>
                <dd className={`text-sm font-semibold ${reimbursementsOwed > 0 ? "text-amber-600" : "text-slate-400"}`}>{currency.format(reimbursementsOwed)}</dd>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
                <dt className="text-xs font-semibold text-slate-800">Est. gross profit</dt>
                <dd className={`text-base font-bold ${estimatedGrossProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{currency.format(estimatedGrossProfit)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── Calm detail: revenue over time (pie removed) ───────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
      </section>

      {/* ── Calm detail: revenue-goal milestone bar ────────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Revenue Goal</h2>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{currency.format(revenueCollected)}</p>
          </div>
          <p className="text-xs text-slate-500">{goalPercent}% of {currency.format(goal)}</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${goalPercent}%` }} />
        </div>
        <div className="mt-2 flex justify-between">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const checkpoint = goal * f;
            const label = checkpoint === 0 ? "$0" : `$${checkpoint / 1000}k`;
            return (
              <span key={f} className={`text-[9px] font-semibold ${f === 0 ? "text-emerald-600" : "text-slate-400"}`}>{label}</span>
            );
          })}
        </div>
      </section>
      </>
      )}

      {/* ── Expenses tab ─────────────────────────────────────────────────────── */}
      {activeTab === "expenses" && (
      <div className="space-y-5">
        {/* ── Hero row: Reimbursements owed (amber on >0) + Total spent + Unpaid ────── */}
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${reimbursementsOwed > 0 ? "bg-amber-50 ring-1 ring-amber-100" : "bg-slate-50 ring-1 ring-slate-100"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Reimbursements Owed</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${reimbursementsOwed > 0 ? "text-amber-700" : "text-slate-900"}`}>{currency.format(reimbursementsOwed)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">owed back to whoever fronted the money</p>
            {reimbursementExpenses.length > 0 && (
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">{reimbursementExpenses.length} to reimburse</span>
            )}
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total Spent</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{currency.format(paidExpenses + unpaidExpenses)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">across all expenses</p>
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Unpaid</p>
            <p className={`mt-2 text-2xl font-bold tracking-tight md:text-3xl ${unpaidExpenses > 0 ? "text-rose-600" : "text-slate-400"}`}>{currency.format(unpaidExpenses)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">{unpaidExpenses > 0 ? "still to pay" : "all paid"}</p>
          </div>
        </section>

        {/* ── Who's owed what — per-person reimbursement (display-only groupBy paid_by) ── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Who&apos;s Owed What</h2>
          {reimbursementsOwed === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
              <p className="text-xs font-semibold text-emerald-800">No reimbursements owed — all settled.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {owedByPerson.map(({ person, amount, count, firstOwed }) => (
                <div key={person} className={`rounded-2xl p-3 ring-1 ${amount > 0 ? "bg-amber-50/70 ring-amber-100" : "bg-slate-50 ring-slate-100"}`}>
                  <p className={`text-xs font-semibold ${amount > 0 ? "text-slate-800" : "text-slate-400"}`}>{person}</p>
                  <p className={`mt-1 text-lg font-bold ${amount > 0 ? "text-amber-700" : "text-slate-300"}`}>{currency.format(amount)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{count} expense{count !== 1 ? "s" : ""}</p>
                  {amount > 0 && firstOwed && (
                    <button
                      type="button"
                      onClick={() => openEditExpenseModal(firstOwed)}
                      className="mt-2 inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      Mark reimbursed
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Calm detail: filter row + expense list ──────────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950 md:text-lg">All Expenses</h2>
              <p className="mt-1 text-[10px] text-slate-400">
                General business costs not tied to a specific client order (materials, packaging, software, tools, etc.).
              </p>
            </div>
            <button
              className="min-h-11 w-full rounded-full bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 sm:w-auto md:text-sm"
              onClick={openAddExpenseModal}
            >
              Add Expense
            </button>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-300 focus:outline-none"
              value={expenseFilter.status}
              onChange={(e) => setExpenseFilter((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <select
              className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-300 focus:outline-none"
              value={expenseFilter.paidBy}
              onChange={(e) => setExpenseFilter((f) => ({ ...f, paidBy: e.target.value }))}
            >
              <option value="">All paid by</option>
              {EXPENSE_PAID_BY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select
              className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-300 focus:outline-none"
              value={expenseFilter.category}
              onChange={(e) => setExpenseFilter((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {(expenseFilter.status !== "all" || expenseFilter.paidBy || expenseFilter.category) && (
              <button
                className="min-h-10 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                onClick={() => setExpenseFilter({ status: "all", paidBy: "", category: "" })}
              >
                Clear
              </button>
            )}
          </div>

          {expensesError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {expensesError}
            </div>
          )}

          {visibleExpenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">
              {expenses.length === 0 ? "No expenses recorded yet. Add your first expense above." : "No expenses match the current filters."}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:flex-row sm:items-start sm:justify-between"
                >
                  {/* Left: info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400">{formatExpenseDate(expense.expense_date)}</span>
                      {expense.category && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${expenseCategoryBadgeClass(expense.category)}`}>
                          {expense.category}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${expense.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {expense.payment_status === "paid" ? "Paid" : "Unpaid"}
                      </span>
                      {expense.reimbursement_status !== "not_needed" && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${expense.reimbursement_status === "reimbursed" ? "bg-slate-100 text-slate-500" : "bg-purple-100 text-purple-700"}`}>
                          {EXPENSE_REIMBURSEMENT_LABELS[expense.reimbursement_status] ?? expense.reimbursement_status}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{expense.vendor_name || "—"}</p>
                    <p className="mt-0.5 text-base font-bold text-slate-950">{currency.format((expense.amount_cents ?? 0) / 100)}</p>
                    {expense.paid_by && (
                      <p className="mt-0.5 text-[10px] text-slate-400">Paid by {expense.paid_by}</p>
                    )}
                    {expense.notes && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{expense.notes}</p>
                    )}
                  </div>
                  {/* Right: actions */}
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditExpenseModal(expense)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingExpenseId === expense.id}
                      onClick={() => void handleDeleteExpense(expense.id)}
                      className="inline-flex min-h-9 items-center justify-center rounded-2xl border border-rose-100 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      aria-label={"Delete " + (expense.vendor_name || "expense")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      {/* ── Invoices tab ─────────────────────────────────────────────────────── */}
      {activeTab === "invoices" && (
      <div className="space-y-5">
        {/* ── Hero row: Outstanding (red on overdue) + Collected + Open ───────────── */}
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${anyInvoiceOverdue ? "bg-rose-50 ring-1 ring-rose-100" : "bg-slate-50 ring-1 ring-slate-100"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Outstanding</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${anyInvoiceOverdue ? "text-rose-600" : "text-slate-900"}`}>{currency.format(outstandingBalance)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">of {currency.format(totalInvoiceValue)} invoiced</p>
            {anyInvoiceOverdue && (
              <span className="mt-3 inline-block rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700">{overdueDisplayCount} overdue</span>
            )}
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Collected</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{currency.format(revenueCollected)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">received to date</p>
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Open Invoices</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{openInvoiceCount}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">{openInvoiceCount === 0 ? "all settled" : "awaiting payment"}</p>
          </div>
        </section>

        {/* ── Needs Attention — unpaid invoices, each → openEditInvoice ────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs Attention</h2>
          {attentionInvoices.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
              <p className="text-xs font-semibold text-emerald-800">All caught up — no invoices need attention.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attentionInvoices.map((inv) => {
                const owedNow = invoiceOwedNow(inv);
                const overdue = owedNow && isInvoiceOverdue(inv);
                return (
                  <div key={inv.id} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${overdue ? "bg-rose-50" : "bg-slate-50"}`}>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{invoiceOrderName(inv) || invoiceClientName(inv) || "Invoice"}</p>
                      <p className="truncate text-[10px] text-slate-400">
                        {invoiceClientName(inv) ? `${invoiceClientName(inv)} · ` : ""}
                        {owedNow
                          ? `balance ${currencyInputValue(inv.balance_remaining)}${overdue ? " · overdue" : ""}`
                          : `${currencyInputValue(inv.balance_remaining)} · Upcoming · not owed yet`}
                      </p>
                    </div>
                    {owedNow ? (
                      <button type="button" onClick={() => openEditInvoice(inv)} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">
                        Send receipt
                      </button>
                    ) : (
                      <button type="button" onClick={() => openSendFinalInvoice(inv)} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700">
                        Send final invoice
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Calm detail: search / filter toolbar + soft card grid ───────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-slate-950">All Invoices</h2>
              <p className="mt-1 text-xs md:text-sm text-slate-600">Click any card to edit invoice details.</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
              <label className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-300 focus:bg-white"
                  placeholder="Search invoices..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                className="min-h-11 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs md:text-sm text-slate-900"
                value={filter}
                onChange={(e) => setFilter(e.target.value as InvoiceStatus | "All" | "Unpaid")}
              >
                <option value="All">All</option>
                <option value="Unpaid">Unpaid</option>
                {invoiceStatusOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <button className="min-h-11 rounded-full bg-blue-600 px-5 py-2.5 text-xs md:text-sm font-semibold text-white hover:bg-blue-700" onClick={openAddModal}>
                Add invoice
              </button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((invoice) => {
              const paidInFull = invoice.final_paid;
              const overdue = isInvoiceOverdue(invoice);
              const byCheck = invoicePaidByCheck(invoice);
              const willCheck = invoiceWillPayByCheck(invoice);
              return (
                <article
                  key={invoice.id}
                  role="button"
                  tabIndex={0}
                  className={`rounded-[2rem] p-4 text-left shadow-sm ring-1 transition hover:shadow-md md:p-5 ${paidInFull ? "bg-emerald-50/40 ring-emerald-200" : overdue ? "bg-white ring-rose-200 hover:ring-rose-300" : "bg-white ring-slate-200 hover:ring-slate-300"}`}
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
                    <span className={"shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] " + statusColors[invoice.status]}>
                      {invoice.status}
                    </span>
                  </div>

                  {(overdue || byCheck || willCheck) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {overdue && !paidInFull && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Overdue</span>
                      )}
                      {byCheck && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          <Check className="h-3 w-3" aria-hidden="true" /> Paid by check
                        </span>
                      )}
                      {willCheck && !byCheck && (
                        <span className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Client will pay by check</span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 space-y-2 text-xs text-slate-600 md:text-sm">
                    {paidInFull ? (
                      <>
                        <div className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> Paid in full</span>
                          <span className="font-semibold text-emerald-700">{currencyInputValue(invoice.total_amount)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                          <span>Deposit</span>
                          <span className="font-semibold text-emerald-700">Received · {currencyInputValue(invoice.deposit_amount)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                          <span>Balance</span>
                          <span className="font-semibold text-emerald-700">Received</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                          <span>Order total</span>
                          <span className="font-semibold text-slate-950">{currencyInputValue(invoice.total_amount)}</span>
                        </div>
                        {invoiceBalance(invoice) > 0 && (
                          <div className={`flex items-center justify-between rounded-2xl px-4 py-2 ${overdue ? "bg-rose-50" : "bg-amber-50"}`}>
                            <span className={overdue ? "text-rose-700" : "text-amber-700"}>Balance due</span>
                            <span className={`font-semibold ${overdue ? "text-rose-700" : "text-amber-700"}`}>{currencyInputValue(invoice.balance_remaining)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                          <span>Deposit</span>
                          <span className={invoice.deposit_paid ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                            {invoice.deposit_paid ? "Received" : "Due"} · {currencyInputValue(invoice.deposit_amount)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                      {paidInFull
                        ? (invoice.final_paid_date ? "Paid in full · " + invoice.final_paid_date : "Paid in full")
                        : (invoice.final_due_date ? "Due " + invoice.final_due_date : "No due date set")}
                    </span>
                    {!paidInFull && (
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
                    )}
                  </div>
                </article>
              );
            })}
            {visible.length === 0 && (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 md:col-span-2 md:text-sm xl:col-span-3">
                No invoices found.
              </div>
            )}
          </div>
        </section>
      </div>
      )}

      {/* ── Sales Tax tab ────────────────────────────────────────────────────── */}
      {activeTab === "sales-tax" && (
      <div className="space-y-5">
        {/* ── Header: rate + year selector + Record Payment ───────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 md:text-lg">Sales Tax</h2>
            <p className="mt-1 text-xs text-slate-500">Rate {fmtTaxRate(configuredTaxRate)} · CA / Bay Area</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700 focus:border-slate-300 focus:outline-none"
              value={selectedTaxYear}
              onChange={(e) => setSelectedTaxYear(e.target.value)}
            >
              {taxYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              className="min-h-10 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              onClick={openAddTaxModal}
            >
              Record Payment
            </button>
          </div>
        </div>

        {/* ── Hero row: Tax Owed (red on >0) + Collected + Remitted ────────────────── */}
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${taxDueForYear > 0 ? "bg-rose-50 ring-1 ring-rose-100" : "bg-slate-50 ring-1 ring-slate-100"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Tax Owed</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${taxDueForYear > 0 ? "text-rose-600" : "text-slate-900"}`}>{currency.format(taxDueForYear)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">{selectedTaxYear} · collected − remitted</p>
            <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${owedTaxQuarters.length > 0 ? "bg-rose-100 text-rose-700" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {owedTaxQuarters.length > 0 ? `${owedTaxQuarters.map((qt) => qt.label).join(", ")} owed` : "all settled"}
            </span>
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Collected</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 md:text-3xl">{currency.format(taxCollectedForYear)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">{selectedTaxYear}</p>
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Remitted</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-blue-700 md:text-3xl">{currency.format(taxPaidForYear)}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">{selectedTaxYear}</p>
          </div>
        </section>

        {/* ── Needs Attention: owed quarters + tax-gap note ───────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs Attention</h2>
          {(taxDueForYear <= 0 && !hasTaxGap) ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
              <p className="text-xs font-semibold text-emerald-800">All caught up — no sales tax owed for {selectedTaxYear}.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {owedTaxQuarters.map((qt) => (
                <div key={qt.q} className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{qt.label} {selectedTaxYear} · {qt.months}</p>
                    <p className="truncate text-[10px] text-slate-400">owed {currency.format(Math.max(qt.collected - qt.paid, 0))} · collected {currency.format(qt.collected)}, remitted {currency.format(qt.paid)}</p>
                  </div>
                  <button type="button" onClick={openAddTaxModal} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700">
                    Record payment
                  </button>
                </div>
              ))}
              {hasTaxGap && (
                <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                  <p className="text-[11px] font-medium text-amber-700">Sales tax estimate may be incomplete — some paid invoices are missing tax data.</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Calm detail: quarterly breakdown ────────────────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Quarterly Breakdown — {selectedTaxYear}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {quarterlyTax.map((qt) => {
              const due = Math.max(qt.collected - qt.paid, 0);
              const isPaid = qt.paid >= qt.collected && qt.collected > 0;
              const isCurrent = qt.q === currentTaxQuarter;
              return (
                <div key={qt.q} className={`rounded-2xl px-3 py-3 ring-1 ${isCurrent ? "bg-blue-50/60 ring-2 ring-blue-300" : isPaid ? "bg-emerald-50 ring-emerald-200" : due > 0 ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-100"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-700">{qt.label}</span>
                    <div className="flex items-center gap-1">
                      {isCurrent && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">Current</span>}
                      {isPaid && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">Paid</span>}
                      {!isPaid && due > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Due</span>}
                      {!isPaid && due === 0 && qt.collected === 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">—</span>}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400">{qt.months}</p>
                  <p className="mt-2 text-sm font-bold text-slate-950">{currency.format(qt.collected)}</p>
                  <p className="text-[10px] text-slate-500">collected</p>
                  {qt.paid > 0 && (
                    <>
                      <p className="mt-1 text-sm font-semibold text-blue-700">{currency.format(qt.paid)}</p>
                      <p className="text-[10px] text-slate-500">remitted</p>
                    </>
                  )}
                  {due > 0 && (
                    <>
                      <p className="mt-1 text-sm font-semibold text-rose-700">{currency.format(due)}</p>
                      <p className="text-[10px] text-slate-500">owed</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Calm detail: payment history ────────────────────────────────────────── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Payment History</p>
          {taxPayments.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">No tax payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {[...taxPayments]
                .sort((a, b) => taxPaymentDateStr(b).localeCompare(taxPaymentDateStr(a)))
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">
                          {taxPaymentDateStr(p) ? new Date(taxPaymentDateStr(p) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </span>
                        {(p.period ?? p.period_start) && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {p.period ?? `${p.period_start ?? ""} – ${p.period_end ?? ""}`.trim()}
                          </span>
                        )}
                        {p.paid_by && <span className="text-[10px] text-slate-400">{p.paid_by}</span>}
                        {p.confirmation_number && <span className="text-[10px] text-slate-400">#{p.confirmation_number}</span>}
                      </div>
                      {p.notes && <p className="mt-0.5 truncate text-[10px] text-slate-400">{p.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold text-slate-950">{currency.format(taxPaymentDollars(p))}</span>
                      <button
                        type="button"
                        onClick={() => openEditTaxModal(p)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTaxPayment(p.id)}
                        className="inline-flex min-h-8 items-center justify-center rounded-xl border border-rose-100 bg-white px-2 py-1.5 text-rose-600 hover:bg-rose-50"
                        aria-label="Delete tax payment"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
      )}

      {/* ── Modals — always rendered, visibility controlled by show* state ──── */}
      {/* Tax payment modal */}
      {showTaxModal && (
        <ModalShell
          title={editingTaxPayment ? "Edit Tax Payment" : "Record Tax Payment"}
          onClose={closeTaxModal}
          maxWidth="max-w-sm"
          footer={
            <div className="space-y-3">
              <FieldError message={taxFormError} />
              <div className="flex gap-3">
                <SaveButton state={taxSave.saveState} onClick={() => void handleSaveTaxPayment()} mode={editingTaxPayment ? undefined : "add"} className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onClick={closeTaxModal}>
                  Cancel
                </button>
              </div>
              {editingTaxPayment && (
                <button
                  type="button"
                  className="min-h-11 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm"
                  onClick={() => void handleDeleteTaxPayment(editingTaxPayment.id)}
                >
                  Delete payment
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date Paid <span className="text-rose-500">*</span></label>
              <input
                type="date"
                value={taxForm.payment_date}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => setTaxForm((f) => ({ ...f, payment_date: e.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Amount <span className="text-rose-500">*</span></label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={taxForm.amount}
                  onChange={(e) => setTaxForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-300 py-3 pl-8 pr-4 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Tax Period <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={taxForm.period_label}
                onChange={(e) => setTaxForm((f) => ({ ...f, period_label: e.target.value }))}
              >
                <option value="">Select period...</option>
                {taxYearOptions.flatMap((y) =>
                  ["Q1", "Q2", "Q3", "Q4"].map((q) => (
                    <option key={`${y}-${q}`} value={`${y} ${q}`}>{y} {q}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Paid By <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={taxForm.paid_by}
                onChange={(e) => setTaxForm((f) => ({ ...f, paid_by: e.target.value }))}
              >
                <option value="">Select...</option>
                {EXPENSE_PAID_BY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Confirmation # <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. CDTFA-12345"
                value={taxForm.confirmation_number}
                onChange={(e) => setTaxForm((f) => ({ ...f, confirmation_number: e.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="Any details about this payment..."
                value={taxForm.notes}
                onChange={(e) => setTaxForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
              />
            </div>
          </div>
        </ModalShell>
      )}

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
          title={invoiceOrderName(editInvoice) || "Invoice"}
          subtitle={invoiceClientName(editInvoice) || undefined}
          onClose={() => { setEditInvoice(null); setFormError(""); editSave.resetSaveState(); setClientDropdownOpen(false); setOrderDropdownOpen(false); }}
          maxWidth="max-w-3xl"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex items-center gap-3">
                <SaveButton state={editSave.saveState} onClick={handleSaveEdit} className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setEditInvoice(null); setFormError(""); editSave.resetSaveState(); setClientDropdownOpen(false); setOrderDropdownOpen(false); }}>
                  Cancel
                </button>
                <button type="button" aria-label="Delete invoice" title="Delete invoice" disabled={deletingId === editInvoice.id} onClick={() => handleDelete(editInvoice.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          }
        >
            {renderFields(editInvoice, (next) => setEditInvoice(next as Invoice), "edit")}
        </ModalShell>
      )}

      <SendReceiptModal
        open={!!receiptInvoice}
        invoice={receiptInvoice}
        fallbackEmail={leadEmailFor(receiptInvoice)}
        fallbackContact={leadContactFor(receiptInvoice)}
        depositNumber={depositNumberFor(receiptInvoice)}
        forcePhase={receiptPhase ?? undefined}
        onClose={() => { setReceiptInvoice(null); setReceiptPhase(null); }}
        onSent={(updated) => void handleReceiptSent(updated as Invoice)}
      />

      {sendInvoiceTarget && (
        <SendFinalInvoiceModal
          open={Boolean(sendInvoiceTarget)}
          invoice={{
            id: sendInvoiceTarget.id,
            client: invoiceClientName(sendInvoiceTarget) || "",
            client_name: sendInvoiceTarget.client_name,
            client_email: sendInvoiceTarget.client_email,
            orderName: invoiceOrderName(sendInvoiceTarget) || "",
            order_name: sendInvoiceTarget.order_name,
            balance_remaining: sendInvoiceTarget.balance_remaining,
          }}
          onClose={() => setSendInvoiceTarget(null)}
          onSent={() => void handleFinalInvoiceSent()}
        />
      )}
      {/* Expense add / edit modal */}
      {showExpenseModal && (
        <ModalShell
          title={editingExpense ? "Edit Expense" : "Add Expense"}
          onClose={closeExpenseModal}
          maxWidth="max-w-md"
          footer={
            <div className="space-y-3">
              <FieldError message={expenseFormError} />
              <div className="flex gap-3">
                <SaveButton state={expenseSave.saveState} onClick={() => void handleSaveExpense()} mode={editingExpense ? undefined : "add"} className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onClick={closeExpenseModal}>
                  Cancel
                </button>
              </div>
              {editingExpense && (
                <button
                  type="button"
                  disabled={deletingExpenseId === editingExpense.id}
                  className="min-h-11 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm disabled:opacity-50"
                  onClick={() => void handleDeleteExpense(editingExpense.id)}
                >
                  Delete expense
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={expenseForm.expense_date}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Amount <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full rounded-2xl border border-slate-300 py-3 pl-8 pr-4 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                    value={expenseForm.amountStr}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, amountStr: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Vendor / Source <span className="text-rose-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. Amazon, Uline, Canva..."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                value={expenseForm.vendor_name}
                onChange={(e) => setExpenseForm((f) => ({ ...f, vendor_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Category <span className="text-rose-500">*</span></label>
              <select
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">Select category...</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Paid By <span className="text-rose-500">*</span></label>
                <select
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={expenseForm.paid_by}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, paid_by: e.target.value }))}
                >
                  <option value="">Select...</option>
                  {EXPENSE_PAID_BY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Payment Status</label>
                <select
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={expenseForm.payment_status}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, payment_status: e.target.value as ExpensePaymentStatus }))}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Reimbursement</label>
              <select
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={expenseForm.reimbursement_status}
                onChange={(e) => setExpenseForm((f) => ({ ...f, reimbursement_status: e.target.value as ExpenseReimbursementStatus }))}
              >
                <option value="not_needed">Not needed</option>
                <option value="needs_reimbursement">Needs reimbursement</option>
                <option value="reimbursed">Reimbursed</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="Invoice number, description, context..."
                className="w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Receipt URL <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="url"
                placeholder="https://..."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                value={expenseForm.receipt_url}
                onChange={(e) => setExpenseForm((f) => ({ ...f, receipt_url: e.target.value }))}
              />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default function FinancesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading finances..." />}>
      <FinancesContent />
    </Suspense>
  );
}
