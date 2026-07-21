"use client";

import { useMemo } from "react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { addDaysToISODate, businessTodayISO, businessTodayLabel } from "@/lib/businessDate";
import GlobalSearch from "@/components/GlobalSearch";
import DashboardHero from "@/components/dashboard/DashboardHero";
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
    <main className="min-h-screen w-full overflow-x-hidden text-sm text-[#0f172a] md:text-base">
      <div className="space-y-5">
        <ErrorBanner message={loadError} />

        {/* Header */}
        <DashboardHero todayLabel={todayLabel} />

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
