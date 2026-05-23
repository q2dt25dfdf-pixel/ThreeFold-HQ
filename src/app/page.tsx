"use client";

import { useMemo } from "react";
import {
  Bell,
  DollarSign,
  Package,
  Users,
  Wrench,
} from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { INACTIVE_ORDER_STATUSES, INACTIVE_FINANCE_STATUSES } from "@/lib/constants";
import { calcBalance } from "@/lib/invoiceCalc";
import { formatCurrency } from "@/lib/format";
import { statusText } from "@/lib/recordUtils";
import { addDaysToISODate, businessTodayISO, businessTodayLabel } from "@/lib/businessDate";
import { isLeadFollowUpDueWithin, leadFollowUpDate } from "@/lib/followUps";
import GlobalSearch from "@/components/GlobalSearch";
import SummaryCards, { type SummaryCard } from "@/components/dashboard/SummaryCards";
import QuickActions from "@/components/dashboard/QuickActions";
import DashboardVisualGrid from "@/components/dashboard/DashboardVisualGrid";

type StorageRecord = Record<string, unknown> & { id: string };

const defaultRows: StorageRecord[] = [];

export default function Home() {
  const { data: orders,         loading: ordersLoading,    error: ordersError    } = useSupabaseTable<StorageRecord>("orders",          defaultRows);
  const { data: finances,       loading: financesLoading,  error: financesError  } = useSupabaseTable<StorageRecord>("finances",        defaultRows);
  const { data: tasks,          loading: tasksLoading,     error: tasksError     } = useSupabaseTable<StorageRecord>("tasks",           defaultRows);
  const { data: crmLeads,       loading: crmLoading,       error: crmError       } = useSupabaseTable<StorageRecord>("crm_leads",       defaultRows);

  const loading   = ordersLoading || financesLoading || tasksLoading || crmLoading;
  const loadError = ordersError   || financesError   || tasksError   || crmError;

  const todayLabel = useMemo(
    () => businessTodayLabel(),
    [],
  );
  const todayISO = useMemo(() => businessTodayISO(), []);
  const sevenDaysAheadISO = useMemo(() => addDaysToISODate(todayISO, 7), [todayISO]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const activeOrders = useMemo(
    () => orders.filter((o) => !INACTIVE_ORDER_STATUSES.has(statusText(o))),
    [orders],
  );

  const inProductionCount = useMemo(
    () => orders.filter((o) => statusText(o).includes("production")).length,
    [orders],
  );

  const totalUnpaidBalance = useMemo(
    () => finances
      .filter((f) => !INACTIVE_FINANCE_STATUSES.has(statusText(f)) && f.final_paid !== true)
      .reduce((sum, f) => sum + calcBalance(f), 0),
    [finances],
  );

  const openLeads = useMemo(
    () => crmLeads.filter((l) => statusText(l) !== "won").length,
    [crmLeads],
  );

  // CRM follow-ups: overdue + due within the next 7 days
  const followUpsDue = useMemo(
    () => crmLeads
      .filter((lead) => isLeadFollowUpDueWithin(lead, tasks, sevenDaysAheadISO))
      .sort((a, b) => {
        const dateA = leadFollowUpDate(a);
        const dateB = leadFollowUpDate(b);
        return dateA.localeCompare(dateB);
      }),
    [crmLeads, tasks, sevenDaysAheadISO],
  );

  const overdueFollowUpsCount = useMemo(
    () => followUpsDue.filter((l) => {
      const date = leadFollowUpDate(l);
      return date < todayISO;
    }).length,
    [followUpsDue, todayISO],
  );

  // ── Summary cards config ──────────────────────────────────────────────────

  const summaryCards = useMemo<SummaryCard[]>(() => [
    {
      label: "Active Orders",
      value: activeOrders.length,
      sub: activeOrders.length === 1 ? "order in progress" : "orders in progress",
      href: "/orders?filter=Active",
      Icon: Package,
      color: "blue",
    },
    {
      label: "Open Leads",
      value: openLeads,
      sub: "in pipeline",
      href: "/crm?view=open",
      Icon: Users,
      color: "violet",
    },
    {
      label: "Unpaid Balance",
      value: totalUnpaidBalance > 0 ? formatCurrency(totalUnpaidBalance) : "$0",
      sub: "outstanding",
      href: "/finances?filter=Unpaid",
      Icon: DollarSign,
      color: totalUnpaidBalance > 0 ? "amber" : "slate",
    },
    {
      label: "Follow-ups Due",
      value: followUpsDue.length,
      sub: overdueFollowUpsCount > 0 ? `${overdueFollowUpsCount} overdue` : "next 7 days",
      href: "/crm?view=followups",
      Icon: Bell,
      color: overdueFollowUpsCount > 0 ? "red" : "slate",
    },
    {
      label: "In Production",
      value: inProductionCount,
      sub: inProductionCount === 1 ? "order" : "orders",
      href: "/orders?filter=Production",
      Icon: Wrench,
      color: inProductionCount > 0 ? "indigo" : "slate",
    },
  ], [activeOrders.length, openLeads, totalUnpaidBalance, followUpsDue.length, overdueFollowUpsCount, inProductionCount]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingState label="Loading dashboard..." />;

  return (
    <main className="min-h-screen w-full overflow-x-hidden text-xs text-[#0f172a] md:text-sm">
      <div className="space-y-5">
        <ErrorBanner message={loadError} />

        {/* Header */}
        <section className="-mx-4 -mt-20 overflow-hidden rounded-none bg-[#0f172a] p-4 pt-24 text-white sm:-mx-6 md:mx-0 md:mt-0 md:rounded-[2rem] md:px-10 md:py-10">
          <p className="text-xs font-medium text-[#94a3b8]">{todayLabel}</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-5xl">Today at Threefold</h1>
          <p className="mt-1 text-xs text-[#94a3b8] md:mt-2 md:text-sm">Your operations at a glance.</p>
        </section>

        {/* Global search */}
        <GlobalSearch />

        {/* KPI summary strip */}
        <SummaryCards cards={summaryCards} />

        {/* Quick actions */}
        <QuickActions />

        {/* Visual executive dashboard */}
        <DashboardVisualGrid
          orders={orders}
          finances={finances}
          tasks={tasks}
          crmLeads={crmLeads}
          todayISO={todayISO}
          sevenDaysAheadISO={sevenDaysAheadISO}
        />

      </div>
    </main>
  );
}
