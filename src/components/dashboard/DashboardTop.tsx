"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { INACTIVE_ORDER_STATUSES } from "@/lib/constants";
import { statusText, stringField } from "@/lib/recordUtils";
import { orderEstDeliveryDate } from "@/lib/estDelivery";
import {
  attentionSummary,
  formatShortDate,
  invoiceHealth,
  monthlyRevenueProgress,
  normalizeCRMStage,
  normalizeOrderStatus,
  parseDashboardDate,
  type DashboardRecord,
} from "@/lib/dashboardMetrics";
import type { ShopFinanceRow } from "@/lib/financesShop";

type Props = {
  orders: DashboardRecord[];
  finances: DashboardRecord[];
  tasks: DashboardRecord[];
  crmLeads: DashboardRecord[];
  shopRows: ShopFinanceRow[];
  todayISO: string;
  sevenDaysAheadISO: string;
  todayLabel: string;
};

// ── Custom-order production stages ────────────────────────────────────────────
// The mockup drew six generic segments (Quote → Deposit → Production → Quality → Ready →
// Delivered). The orders table's REAL workflow is 8 statuses (dashboardMetrics ORDER_STATUS_ORDER):
// Design → Approved → Deposit Paid → Production → Quality Check → Ready → Delivered → Completed.
// Per the WO we use the real stages, collapsed to six segments: Approved folds into Design and
// Completed folds into Delivered. Timeline shows active orders, so "now" is normally segments 0–4.
const STAGE_SEGMENTS = ["Design", "Deposit", "Production", "Quality", "Ready", "Delivered"] as const;

function stageIndex(normalizedStatus: string): number {
  switch (normalizedStatus) {
    case "Design":
    case "Approved":
      return 0;
    case "Deposit Paid":
      return 1;
    case "Production":
      return 2;
    case "Quality Check":
      return 3;
    case "Ready":
      return 4;
    case "Delivered":
    case "Completed":
      return 5;
    default:
      return 2; // unknown active status → Production (matches normalizeOrderStatus default)
  }
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = parseDashboardDate(fromISO);
  const b = parseDashboardDate(toISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function orderEstDelivery(order: DashboardRecord): string {
  return (
    orderEstDeliveryDate(order) ||
    stringField(order, "dueDate") ||
    stringField(order, "final_due_date")
  );
}

export default function DashboardTop({
  orders,
  finances,
  tasks,
  crmLeads,
  shopRows,
  todayISO,
  sevenDaysAheadISO,
  todayLabel,
}: Props) {
  const m = useMemo(() => {
    // Mirror DashboardVisualGrid's TEST-record exclusion so the numbers match exactly:
    // drop is_test leads and any finances/orders whose lead_id belongs to a test lead.
    const testLeadIds = new Set(crmLeads.filter((l) => l.is_test === true).map((l) => l.id));
    const isTestRow = (r: Record<string, unknown>) => testLeadIds.has(String(r.lead_id ?? ""));
    const rLeads = crmLeads.filter((l) => l.is_test !== true);
    const rFinances = finances.filter((f) => !isTestRow(f));
    const rOrders = orders.filter((o) => !isTestRow(o));

    // Custom (anon tables)
    const revenue = monthlyRevenueProgress(rFinances, todayISO);
    const invoices = invoiceHealth(rFinances, todayISO);
    const summary = attentionSummary(rOrders, rFinances, tasks, rLeads, todayISO, sevenDaysAheadISO);
    const paidInvoices = invoices.find((b) => b.name === "Paid")?.value ?? 0;
    const overdueInvoices = invoices.find((b) => b.name === "Overdue")?.value ?? 0;

    const newLeads = rLeads.filter(
      (l) => l.archived !== true && normalizeCRMStage(stringField(l, "stage")) === "New Lead",
    ).length;

    const activeOrders = rOrders.filter((o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)));
    const missingDelivery = activeOrders.filter((o) => !orderEstDelivery(o)).length;
    const inProduction = activeOrders.filter((o) => normalizeOrderStatus(o) === "Production").length;
    const overdueAnything = summary.overdueTasks + overdueInvoices + summary.staleLeads;

    // Shop (RLS-safe rows from /api/finances/shop-summary) — net of tax, refund-guarded.
    const live = shopRows.filter((r) => r.refunded !== true && (r.status ?? "").toLowerCase() !== "refunded");
    const toShip = live.filter((r) => !r.shipped);
    const monthKey = todayISO.slice(0, 7);
    const shopNetMonth = live
      .filter((r) => (r.created_at ?? "").slice(0, 7) === monthKey)
      .reduce((s, r) => s + ((r.amount ?? 0) - (r.tax_amount ?? 0)), 0);
    const shopOrdersToday = live.filter((r) => (r.created_at ?? "").slice(0, 10) === todayISO).length;
    const oldestToShipISO = toShip
      .map((r) => r.created_at ?? "")
      .filter(Boolean)
      .sort()[0];

    // Timeline rows — active orders, action-needed (missing date / overdue) sorted first.
    const timeline = activeOrders
      .map((o) => {
        const est = orderEstDelivery(o);
        const missing = !est;
        const overdue = !missing && est < todayISO;
        return {
          id: o.id,
          name: stringField(o, "orderName") || stringField(o, "order_name") || "Order",
          status: normalizeOrderStatus(o),
          est,
          missing,
          overdue,
          idx: stageIndex(normalizeOrderStatus(o)),
        };
      })
      .sort((a, b) => {
        const rank = (r: typeof a) => (r.missing ? 0 : r.overdue ? 1 : 2);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (a.est || "9999").localeCompare(b.est || "9999");
      });

    const customCollected = revenue.collected;
    const augRevenue = shopNetMonth + customCollected;

    return {
      goal: revenue.goal,
      customCollected,
      shopNetMonth,
      augRevenue,
      shopOrdersToday,
      toShipCount: toShip.length,
      oldestToShipISO,
      inProduction,
      paidInvoices,
      overdueInvoices,
      newLeads,
      missingDelivery,
      ordersDueSoon: summary.ordersDueSoon,
      overdueAnything,
      timeline,
    };
  }, [crmLeads, finances, orders, tasks, shopRows, todayISO, sevenDaysAheadISO]);

  const bandDate = todayLabel.replace(", ", " · ").toUpperCase();

  // ── Needs-a-founder tiles ───────────────────────────────────────────────────
  const tiles: { n: number; label: string; href: string; tone: "hot" | "alert" | "plain" }[] = [
    { n: m.toShipCount, label: "Shop orders to ship", href: "/shop-orders", tone: "hot" },
    { n: m.missingDelivery, label: "Custom orders missing delivery date", href: "/orders", tone: "alert" },
    { n: m.ordersDueSoon, label: "Custom orders due this week", href: "/orders", tone: "hot" },
    { n: m.newLeads, label: "New leads waiting", href: "/crm", tone: "plain" },
    {
      n: m.overdueAnything,
      label: "Overdue anything",
      href: m.overdueInvoices > 0 ? "/finances" : "/tasks",
      tone: "alert",
    },
  ];

  const tileClasses = (t: { n: number; tone: string }) => {
    if (t.n === 0) return { box: "bg-slate-50", num: "text-slate-300" };
    if (t.tone === "alert") return { box: "bg-rose-50", num: "text-rose-600" };
    if (t.tone === "hot") return { box: "bg-amber-50", num: "text-amber-700" };
    return { box: "bg-slate-50", num: "text-slate-900" };
  };

  const h3 = "flex items-center text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400";
  const link = "ml-auto text-[11px] font-semibold normal-case tracking-normal text-blue-600 hover:text-blue-700";
  const card = "rounded-[1.65rem] bg-white p-5 shadow-sm ring-1 ring-slate-100";

  return (
    <div className="space-y-3.5">
      {/* 1 — SLIM BRAND BAND (fixed ~96px, never full-viewport) */}
      <div
        className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-[1.65rem] px-6 py-4 text-white"
        style={{ background: "linear-gradient(100deg,#0b1430 0%,#122150 55%,#1b2f6e 100%)" }}
      >
        <div className="pointer-events-none absolute -bottom-12 -right-8 h-[170px] w-[340px] rounded-full"
          style={{ background: "radial-gradient(closest-side,rgba(122,162,255,.35),transparent 70%)" }} />
        <div className="relative z-10 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-300">{bandDate}</div>
          <div className="mt-0.5 text-[22px] font-extrabold leading-tight">Today at Threefold</div>
          <div className="mt-0.5 text-[12.5px] text-indigo-200/80">Built in the Bay. Delivered everywhere.</div>
        </div>
        <div className="relative z-10 ml-auto flex flex-wrap gap-2.5">
          {[
            { n: <>{formatCurrency(m.augRevenue)}{m.augRevenue > 0 && <span className="text-[12px] font-bold text-emerald-300"> ↑</span>}</>, l: "Aug revenue" },
            { n: m.toShipCount, l: "To ship" },
            { n: m.inProduction, l: "In production" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-right">
              <div className="text-[20px] font-extrabold leading-none">{s.n}</div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.08em] text-indigo-200/80">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2 — NEEDS A FOUNDER TODAY */}
      <div className={card}>
        <h3 className={`${h3} mb-3`}>Needs a founder today</h3>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          {tiles.map((t) => {
            const c = tileClasses(t);
            return (
              <Link key={t.label} href={t.href}
                className={`rounded-xl border-2 border-transparent p-3 transition hover:border-blue-500 ${c.box}`}>
                <div className={`text-[21px] font-extrabold ${c.num}`}>{t.n}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{t.label}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 3 — CARDS ROW */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <div className={card}>
          <h3 className={h3}>Revenue · August <Link href="/finances" className={link}>Finances ↗</Link></h3>
          <div className="mt-2 text-[28px] font-extrabold text-slate-900">{formatCurrency(m.augRevenue)}</div>
          <div className="mt-1 text-[12.5px] text-slate-500">
            Shop {formatCurrency(m.shopNetMonth)} · Custom {formatCurrency(m.customCollected)} · goal {formatCurrency(m.goal)}
          </div>
          {m.shopOrdersToday > 0 && (
            <div className="mt-2.5">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
                {m.shopOrdersToday} shop order{m.shopOrdersToday !== 1 ? "s" : ""} today
              </span>
            </div>
          )}
        </div>

        <div className={card}>
          <h3 className={h3}>To Ship <Link href="/shop-orders" className={link}>Shop Orders ↗</Link></h3>
          <div className="mt-2 text-[28px] font-extrabold text-slate-900">{m.toShipCount}</div>
          <div className="mt-1 text-[12.5px] text-slate-500">
            shop orders waiting{m.oldestToShipISO ? ` · oldest ${formatShortDate(parseDashboardDate(m.oldestToShipISO) ?? new Date())}` : ""}
          </div>
        </div>

        <div className={card}>
          <h3 className={h3}>Invoice Health <Link href="/finances" className={link}>Finances ↗</Link></h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-[12px] text-slate-600">Paid <b className="text-slate-900">{m.paidInvoices}</b></span>
            {m.overdueInvoices > 0
              ? <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-600">{m.overdueInvoices} overdue</span>
              : <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700">No overdue invoices</span>}
          </div>
        </div>
      </div>

      {/* 4 — PRODUCTION TIMELINE · CUSTOM ORDERS */}
      <div className={card}>
        <h3 className={`${h3} mb-3.5`}>Production Timeline · Custom Orders <Link href="/orders" className={link}>Orders ↗</Link></h3>
        {m.timeline.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-slate-400">No active custom orders.</div>
        ) : (
          m.timeline.map((r, i) => (
            <Link key={r.id} href={`/orders/${r.id}`}
              className={`block ${i > 0 ? "border-t border-slate-100" : ""} py-3.5`}>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[14.5px] font-bold text-slate-900">{r.name}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em] ${
                  r.idx >= 3 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                }`}>{r.status}</span>
                <span className={`ml-auto text-[12.5px] ${r.missing || r.overdue ? "font-bold text-rose-600" : "text-slate-500"}`}>
                  {r.missing
                    ? "⚠ Est. delivery not set"
                    : r.overdue
                      ? "Overdue"
                      : <>Due <b className="text-slate-800">{formatShortDate(parseDashboardDate(r.est) ?? new Date())}</b> · {daysBetween(todayISO, r.est)} days left</>}
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5">
                {STAGE_SEGMENTS.map((_, si) => (
                  <div key={si} className={`h-[7px] flex-1 rounded-full ${
                    si < r.idx ? "bg-emerald-500" : si === r.idx ? "bg-blue-600" : "bg-slate-200"
                  }`} />
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {STAGE_SEGMENTS.map((label, si) => (
                  <span key={si} className={`flex-1 text-center text-[9.5px] tracking-[0.02em] ${
                    si === r.idx ? "font-bold text-blue-600" : "text-slate-400"
                  }`}>{label}</span>
                ))}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
