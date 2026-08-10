"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronLeft } from "lucide-react";

const sections = [
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Orders", href: "/orders" },
  { label: "Shop Orders", href: "/shop-orders" },
  { label: "Clients", href: "/clients" },
  { label: "Vendors", href: "/vendors" },
  { label: "Inventory", href: "/inventory" },
  { label: "Finances", href: "/finances" },
  { label: "Tasks", href: "/tasks" },
  { label: "Calendar", href: "/calendar" },
  { label: "Notes", href: "/notes" },
  { label: "Reports", href: "/reports" },
];

export default function Sidebar({
  className = "hidden lg:flex",
  onNavigate,
  onToggleCollapse,
  showCollapseToggle = false,
}: {
  className?: string;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  showCollapseToggle?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // SHARED "new" badges (Shop Orders / Orders). One cheap fetch on mount; refetch only when a
  // badged page marks itself seen (dispatches "tf-badges-refresh") — not on every navigation.
  const [badges, setBadges] = useState<{ shopOrders: number; orders: number; finances: number; inventory: number }>({ shopOrders: 0, orders: 0, finances: 0, inventory: 0 });
  const loadBadges = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/badges", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (res.ok) setBadges(await res.json());
    } catch { /* non-fatal */ }
  }, []);
  useEffect(() => {
    loadBadges();
    const onRefresh = () => loadBadges();
    window.addEventListener("tf-badges-refresh", onRefresh);
    return () => window.removeEventListener("tf-badges-refresh", onRefresh);
  }, [loadBadges]);
  const badgeFor = (href: string) => (href === "/shop-orders" ? badges.shopOrders : href === "/orders" ? badges.orders : href === "/finances" ? badges.finances : href === "/inventory" ? badges.inventory : 0);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate?.();
    router.replace("/login");
  };

  return (
    <aside className={`${className} fixed left-0 top-0 h-screen max-h-screen w-[280px] shrink-0 flex-col overflow-y-auto bg-slate-950 text-slate-100 will-change-transform`}>
      <button
        type="button"
        aria-label="Collapse sidebar"
        onClick={onToggleCollapse}
        className={`${showCollapseToggle ? "lg:flex" : "lg:hidden"} absolute right-3 top-4 z-20 hidden h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-md transition hover:bg-slate-100`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-h-full flex-col justify-between gap-8 px-6 py-8">
        <div>
          <div className="pb-6">
            <img src="/brand/threefold-logo.png" alt="Threefold Supply Co." width={1240} height={894} className="block h-auto w-full max-w-[210px]" />
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Threefold HQ</h1>
            <p className="mt-3 text-sm text-slate-300">Made by three, worn by all.</p>
          </div>

          <nav className="space-y-2">
            {sections.map((section) => {
              const active = section.href === "/" ? pathname === "/" : pathname === section.href || pathname.startsWith(`${section.href}/`);
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={onNavigate}
                  className={`flex items-center justify-between rounded-3xl px-4 py-3 text-sm font-semibold transition active:bg-white/10 ${
                    active
                      ? "bg-slate-100 text-slate-950 shadow-md"
                      : "text-slate-300 hover:bg-white/5 hover:text-slate-50"
                  }`}
                >
                  <span>{section.label}</span>
                  {badgeFor(section.href) > 0 && (
                    <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      {badgeFor(section.href)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3">
          <div className="rounded-[2rem] bg-slate-900/95 p-5 ring-1 ring-white/10">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Threefold founders</div>
            <div className="mt-4 space-y-3">
              {[
                { initials: "AP", name: "Alliyah", role: "Sales & BD" },
                { initials: "H", name: "Hannah", role: "Ops & Fulfillment" },
                { initials: "J", name: "Jordan", role: "Fulfillment & Bookkeeping" },
              ].map((member) => (
                <div key={member.name} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-xs font-semibold text-white">
                    {member.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{member.name}</div>
                    <div className="text-xs text-slate-400">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-3xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 hover:text-white active:bg-white/10"
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
