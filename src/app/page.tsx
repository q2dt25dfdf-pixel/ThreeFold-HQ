"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "@/components/AppState";
import { DashboardSkeleton } from "@/components/Skeleton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { addDaysToISODate, businessTodayISO, businessTodayLabel } from "@/lib/businessDate";
import { supabase } from "@/lib/supabase";
import type { ShopFinanceRow } from "@/lib/financesShop";
import GlobalSearch from "@/components/GlobalSearch";
import DashboardTop from "@/components/dashboard/DashboardTop";
import DashboardVisualGrid from "@/components/dashboard/DashboardVisualGrid";

type StorageRecord = Record<string, unknown> & { id: string };

const defaultRows: StorageRecord[] = [];

export default function Home() {
  const { data: orders,         loading: ordersLoading,    error: ordersError    } = useSupabaseTable<StorageRecord>("orders",          defaultRows);
  const { data: finances,       loading: financesLoading,  error: financesError  } = useSupabaseTable<StorageRecord>("finances",        defaultRows);
  const { data: tasks,          loading: tasksLoading,     error: tasksError     } = useSupabaseTable<StorageRecord>("tasks",           defaultRows);
  const { data: crmLeads,       loading: crmLoading,       error: crmError       } = useSupabaseTable<StorageRecord>("crm_leads",       defaultRows);

  // Shop slice is RLS-on (anon can't read shop_orders) — thread it in server-side via the
  // session-gated shop-summary API, same pattern as the Finances page. Empty until it loads.
  const [shopRows, setShopRows] = useState<ShopFinanceRow[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch("/api/finances/shop-summary", {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        });
        if (res.ok) { const d = await res.json(); setShopRows(d.rows ?? []); }
      } catch { /* leave shop figures at 0 on failure — never blocks the custom side */ }
    })();
  }, []);

  const loading   = ordersLoading || financesLoading || tasksLoading || crmLoading;
  const loadError = ordersError   || financesError   || tasksError   || crmError;

  const todayLabel = useMemo(() => businessTodayLabel(), []);
  const todayISO = useMemo(() => businessTodayISO(), []);
  const sevenDaysAheadISO = useMemo(() => addDaysToISODate(todayISO, 7), [todayISO]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <main className="min-h-screen w-full overflow-x-hidden text-sm text-[#0f172a] md:text-base">
      <DashboardSkeleton />
    </main>
  );

  return (
    <main className="min-h-screen w-full overflow-x-hidden text-sm text-[#0f172a] md:text-base">
      <div className="space-y-5">
        <ErrorBanner message={loadError} />

        {/* Revamped top: slim brand band + needs-a-founder strip + revenue/ship/health cards + timeline */}
        <DashboardTop
          orders={orders}
          finances={finances}
          tasks={tasks}
          crmLeads={crmLeads}
          shopRows={shopRows}
          todayISO={todayISO}
          sevenDaysAheadISO={sevenDaysAheadISO}
          todayLabel={todayLabel}
        />

        {/* Global search */}
        <GlobalSearch />

        {/* Remaining executive cards (Pipeline, Production Pipeline, Follow-Up Load, Task Load, Needs Attention) */}
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
