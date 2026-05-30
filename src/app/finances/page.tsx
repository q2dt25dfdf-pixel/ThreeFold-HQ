"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
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
  stripe_invoice_url?: string;
  subtotal?: number;
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
const emptyForm = { client: "", orderName: "", client_id: "", client_name: "", client_email: "", client_company: "", order_id: "", order_name: "", amount: 0, total_amount: 0, deposit_amount: 0, deposit_paid: false, deposit_paid_date: "", balance_remaining: 0, final_due_date: "", final_paid: false, final_paid_date: "", dueDate: "", status: "Draft" as InvoiceStatus, notes: "", stripe_invoice_url: "" };
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
  const outstandingBalance = normalizedInvoices
    .filter((invoice) => !invoice.final_paid)
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
          <p className="mt-1.5 text-[10px] font-semibold text-emerald-600">✓ Connected to client record</p>
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
          <p className="mt-1.5 text-[10px] font-semibold text-emerald-600">✓ Linked to order — payment data syncs to client portal</p>
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

  if (loading) return <LoadingState label="Loading finances..." />;

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
          {FINANCE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => updateTab(tab.value)}
              className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold transition md:text-sm ${
                activeTab === tab.value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
      <>
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

      {/* ── Internal Financial Summary ─────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-950 md:text-lg">Internal Financial Summary</h2>
          <p className="mt-1 text-[10px] text-slate-400">
            Based on current stored invoice, order, and expense data only. Does not include unsaved or external data.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* Paid Revenue */}
          <div className="rounded-2xl bg-emerald-50 px-4 py-4">
            <p className="text-xl font-bold tracking-tight text-emerald-700 md:text-2xl">{currency.format(revenueCollected)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Paid Revenue</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Cash collected: deposits + final payments received</p>
          </div>
          {/* Open Invoices */}
          <div className={`rounded-2xl px-4 py-4 ${outstandingBalance > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${outstandingBalance > 0 ? "text-amber-700" : "text-slate-500"}`}>
              {currency.format(outstandingBalance)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Open Invoices</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Balance remaining on invoices not yet paid in full</p>
          </div>
          {/* Total Vendor Costs */}
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">{currency.format(totalVendorCosts)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Total Vendor Costs</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Sum of all vendor costs recorded on orders</p>
          </div>
          {/* Unpaid Vendor Costs */}
          <div className={`rounded-2xl px-4 py-4 ${unpaidVendorCosts > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${unpaidVendorCosts > 0 ? "text-rose-700" : "text-slate-500"}`}>
              {currency.format(unpaidVendorCosts)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Unpaid Vendor Costs</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Vendor costs where payment status is not marked paid</p>
          </div>
          {/* Estimated Gross Profit */}
          <div className={`rounded-2xl px-4 py-4 ${estimatedGrossProfit >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${estimatedGrossProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {currency.format(estimatedGrossProfit)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Est. Gross Profit</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Paid revenue minus paid vendor costs</p>
          </div>
          {/* Sales Tax Owed */}
          <div className={`rounded-2xl px-4 py-4 ${taxDue > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${taxDue > 0 ? "text-rose-700" : "text-slate-950"}`}>
              {currency.format(taxDue)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Sales Tax Owed</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {currency.format(taxCollectedYTD)} collected YTD · {currency.format(taxPaidYTD)} remitted
            </p>
            {hasTaxGap && (
              <p className="mt-1.5 text-[10px] font-medium text-amber-700">
                ⚠ Sales tax estimate may be incomplete — some paid invoices are missing tax data.
              </p>
            )}
          </div>
          {/* Paid Expenses */}
          <div className={`rounded-2xl px-4 py-4 ${paidExpenses > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${paidExpenses > 0 ? "text-rose-700" : "text-slate-500"}`}>
              {currency.format(paidExpenses)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Paid Expenses</p>
            <p className="mt-0.5 text-[10px] text-slate-500">General business expenses marked paid</p>
          </div>
          {/* Unpaid Expenses */}
          <div className={`rounded-2xl px-4 py-4 ${unpaidExpenses > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${unpaidExpenses > 0 ? "text-amber-700" : "text-slate-500"}`}>
              {currency.format(unpaidExpenses)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Unpaid Expenses</p>
            <p className="mt-0.5 text-[10px] text-slate-500">General business expenses not yet paid</p>
          </div>
          {/* Net Position */}
          <div className={`rounded-2xl px-4 py-4 ${netPosition >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${netPosition >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {currency.format(netPosition)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Net Position</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Paid revenue − paid vendor costs − paid expenses</p>
          </div>
        </div>
        {ordersWithoutVendorCost > 0 && (
          <p className="mt-3 text-[10px] text-slate-400">
            {ordersWithoutVendorCost} active order{ordersWithoutVendorCost !== 1 ? "s" : ""} have no vendor cost recorded — vendor cost totals may be understated.
          </p>
        )}
      </section>
      </>
      )}

      {/* ── Expenses tab ─────────────────────────────────────────────────────── */}
      {activeTab === "expenses" && (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 md:text-lg">Expenses</h2>
            <p className="mt-1 text-[10px] text-slate-400">
              General business costs not tied to a specific client order (materials, packaging, software, tools, etc.).
            </p>
          </div>
          <button
            className="min-h-11 w-full rounded-3xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 sm:w-auto md:text-sm"
            onClick={openAddExpenseModal}
          >
            Add Expense
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            className="min-h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            value={expenseFilter.status}
            onChange={(e) => setExpenseFilter((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select
            className="min-h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            value={expenseFilter.paidBy}
            onChange={(e) => setExpenseFilter((f) => ({ ...f, paidBy: e.target.value }))}
          >
            <option value="">All paid by</option>
            {EXPENSE_PAID_BY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select
            className="min-h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            value={expenseFilter.category}
            onChange={(e) => setExpenseFilter((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(expenseFilter.status !== "all" || expenseFilter.paidBy || expenseFilter.category) && (
            <button
              className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
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
                className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-start sm:justify-between"
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
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingExpenseId === expense.id}
                    onClick={() => void handleDeleteExpense(expense.id)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl border border-rose-100 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {activeTab === "overview" && (
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
      )}

      {/* ── Invoices tab ─────────────────────────────────────────────────────── */}
      {activeTab === "invoices" && (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-950">Invoices</h2>
            <p className="mt-1 text-xs md:text-sm text-slate-600">Click any row to edit invoice details.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
              <input
                className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="Search invoices..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm text-slate-900"
              value={filter}
              onChange={(e) => setFilter(e.target.value as InvoiceStatus | "All" | "Unpaid")}
            >
              <option value="All">All</option>
              <option value="Unpaid">Unpaid</option>
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
              className={`rounded-[2rem] border bg-white p-4 text-left shadow-sm transition hover:shadow-md md:p-5 ${invoice.final_paid ? "border-emerald-200 hover:border-emerald-300" : "border-slate-200 hover:border-slate-300"}`}
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

              <div className="mt-4 space-y-2 text-xs text-slate-600 md:text-sm">
                {invoice.final_paid ? (
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-2.5">
                    <span className="font-semibold text-emerald-700">Paid in full</span>
                    <span className="font-semibold text-emerald-700">{currencyInputValue(invoice.total_amount)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                      <span>Order total</span>
                      <span className="font-semibold text-slate-950">{currencyInputValue(invoice.total_amount)}</span>
                    </div>
                    {invoiceBalance(invoice) > 0 && (
                      <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-2">
                        <span className="text-amber-700">Balance due</span>
                        <span className="font-semibold text-amber-700">{currencyInputValue(invoice.balance_remaining)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2">
                  <span>Deposit</span>
                  <span className={invoice.deposit_paid ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                    {invoice.deposit_paid ? "Received" : "Due"} · {currencyInputValue(invoice.deposit_amount)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">{invoice.final_due_date ? "Due " + invoice.final_due_date : "No due date set"}</span>
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
      )}

      {activeTab === "overview" && (
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
      )}

      {/* ── Sales Tax tab ────────────────────────────────────────────────────── */}
      {activeTab === "sales-tax" && (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950 md:text-lg">Sales Tax Dashboard</h2>
            <p className="mt-1 text-xs text-slate-500">Rate: {fmtTaxRate(configuredTaxRate)} · CA / Bay Area</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="min-h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
              value={selectedTaxYear}
              onChange={(e) => setSelectedTaxYear(e.target.value)}
            >
              {taxYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              className="min-h-10 rounded-3xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              onClick={openAddTaxModal}
            >
              Record Payment
            </button>
          </div>
        </div>

        {/* 4 summary cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-2xl bg-emerald-50 px-4 py-4">
            <p className="text-xl font-bold tracking-tight text-emerald-700 md:text-2xl">{currency.format(taxCollectedForYear)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Tax Collected</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{selectedTaxYear}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 px-4 py-4">
            <p className="text-xl font-bold tracking-tight text-blue-700 md:text-2xl">{currency.format(taxPaidForYear)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Tax Remitted</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{selectedTaxYear}</p>
          </div>
          <div className={`rounded-2xl px-4 py-4 ${taxDueForYear > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
            <p className={`text-xl font-bold tracking-tight md:text-2xl ${taxDueForYear > 0 ? "text-rose-700" : "text-slate-500"}`}>{currency.format(taxDueForYear)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Tax Owed</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{selectedTaxYear} outstanding</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">{fmtTaxRate(configuredTaxRate)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Tax Rate</p>
            <p className="mt-0.5 text-[10px] text-slate-500">CA / Bay Area</p>
          </div>
        </div>

        {/* Quarterly breakdown */}
        <div className="mb-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Quarterly Breakdown — {selectedTaxYear}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quarterlyTax.map((qt) => {
              const due = Math.max(qt.collected - qt.paid, 0);
              const isPaid = qt.paid >= qt.collected && qt.collected > 0;
              return (
                <div key={qt.q} className={`rounded-2xl border px-3 py-3 ${isPaid ? "border-emerald-200 bg-emerald-50" : due > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-700">{qt.label}</span>
                    {isPaid && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">Paid</span>}
                    {!isPaid && due > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Due</span>}
                    {!isPaid && due === 0 && qt.collected === 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">—</span>}
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
        </div>

        {/* Payment history */}
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Payment History</p>
          {taxPayments.length === 0 ? (
            <p className="text-center text-xs text-slate-400">No tax payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {[...taxPayments]
                .sort((a, b) => taxPaymentDateStr(b).localeCompare(taxPaymentDateStr(a)))
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
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
                        className="inline-flex min-h-8 items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTaxPayment(p.id)}
                        className="inline-flex min-h-8 items-center rounded-xl border border-rose-100 bg-white px-2 py-1.5 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {hasTaxGap && (
          <p className="mt-3 text-[10px] text-amber-700">
            ⚠ Sales tax estimate may be incomplete — some paid invoices are missing tax data.
          </p>
        )}
      </section>
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
