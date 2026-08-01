"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/shopOrders";

type Row = {
  id: string; name: string; email: string; created_at: string | null;
  items: string; total: number; shipTo: string; shipped: boolean; shipped_at: string | null;
};
type Stats = { toShipCount: number; toShipCollected: number; shippedThisWeek: number; revenue30Days: number };
type Filter = "to-ship" | "shipped" | "all";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ShopOrdersPage() {
  const [filter, setFilter] = useState<Filter>("to-ship");
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // order id being marked shipped

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop-orders?filter=${f}`, { headers: await authHeaders() });
      const d = await res.json();
      if (res.ok) { setStats(d.stats); setOrders(d.orders); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  // Mark the section seen on view → clears the sidebar badge for everyone; nudge the sidebar.
  useEffect(() => {
    (async () => {
      await fetch("/api/badges", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ section: "shop-orders" }) }).catch(() => {});
      window.dispatchEvent(new Event("tf-badges-refresh"));
    })();
  }, []);

  async function markShipped(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/shop-orders/${id}`, { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ shipped: true }) });
      if (res.ok) await load(filter);
    } finally { setBusy(null); }
  }

  async function exportCsv() {
    const res = await fetch("/api/shop-orders/export", { headers: await authHeaders() });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "shop-orders-to-ship.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const tile = "rounded-2xl bg-white p-5 md:p-6";
  const lbl = "text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Shop · ThreeFold Originals</div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold text-slate-900">Shop Orders</h1>
        <button onClick={exportCsv} className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50">
          Export Pirate Ship CSV ↓
        </button>
      </div>

      {/* stat tiles */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={tile}>
          <div className={lbl}>To Ship</div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">{stats?.toShipCount ?? "—"}</div>
          <div className="mt-1 text-[13px] text-slate-500">unshipped orders</div>
          {stats && <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{money(stats.toShipCollected)} collected</span>}
        </div>
        <div className={tile}>
          <div className={lbl}>Shipped</div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">{stats?.shippedThisWeek ?? "—"}</div>
          <div className="mt-1 text-[13px] text-slate-500">this week</div>
        </div>
        <div className={tile}>
          <div className={lbl}>Shop Revenue</div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">{stats ? money(stats.revenue30Days) : "—"}</div>
          <div className="mt-1 text-[13px] text-slate-500">last 30 days · incl. tax &amp; shipping</div>
        </div>
      </div>

      {/* filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["to-ship", "shipped", "all"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-sm ${filter === f ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {f === "to-ship" ? "To Ship" : f === "shipped" ? "Shipped" : "All"}
          </button>
        ))}
        <span className="ml-auto text-[12.5px] text-slate-400">CSV exports the “To Ship” list</span>
      </div>

      {/* cards */}
      {loading ? (
        <div className="mt-6 text-sm text-slate-400">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-slate-400">No orders in this view.</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border-2 border-transparent bg-white p-5 md:p-6 transition hover:border-blue-500">
              <div className="flex items-center gap-2">
                <span className="text-[16.5px] font-extrabold text-slate-900">{o.name}</span>
                <span className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.08em] ${o.shipped ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {o.shipped ? "SHIPPED" : "TO SHIP"}
                </span>
              </div>
              <div className="mt-1 text-[13.5px] text-slate-500">{fmtDate(o.created_at)}{o.email ? ` · ${o.email}` : ""}</div>
              <div className="mt-3 flex justify-between gap-3 rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13.5px]">
                <span className="text-slate-500">Items</span><span className="max-w-[60%] text-right font-semibold text-slate-800">{o.items || "—"}</span>
              </div>
              <div className="mt-2 flex justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13.5px]">
                <span className="text-slate-500">Total paid</span><span className="font-semibold text-slate-800">{money(o.total)}</span>
              </div>
              <div className="mt-2 flex justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13.5px]">
                <span className="text-slate-500">Ship to</span><span className="font-semibold text-slate-800">{o.shipTo}</span>
              </div>
              <div className="mt-3 flex gap-2.5">
                <Link href={`/shop-orders/${o.id}`} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-[13.5px] font-semibold text-slate-900 hover:bg-slate-50">View order →</Link>
                {!o.shipped && (
                  <button onClick={() => markShipped(o.id)} disabled={busy === o.id}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50">
                    {busy === o.id ? "Marking…" : "Mark shipped"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
