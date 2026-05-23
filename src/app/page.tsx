"use client";

import { useMemo } from "react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { addDaysToISODate, businessTodayISO, businessTodayLabel } from "@/lib/businessDate";
import GlobalSearch from "@/components/GlobalSearch";
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

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingState label="Loading dashboard..." />;

  return (
    <main className="min-h-screen w-full overflow-x-hidden text-xs text-[#0f172a] md:text-sm">
      <div className="space-y-5">
        <ErrorBanner message={loadError} />

        {/* Header */}
        <section className="relative -mx-4 -mt-20 overflow-hidden rounded-none border border-slate-800/70 bg-[radial-gradient(circle_at_78%_18%,rgba(37,99,235,0.32),transparent_32%),linear-gradient(145deg,#08111f,#0f172a_54%,#111827)] p-5 pt-24 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:-mx-6 md:mx-0 md:mt-0 md:rounded-[2.25rem] md:px-10 md:py-14">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/70">{todayLabel}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white md:text-6xl">Today at Threefold</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 md:mt-3 md:text-base">Your operations at a glance.</p>
        </section>

        {/* Global search */}
        <GlobalSearch />

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
