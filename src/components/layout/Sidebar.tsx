"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ChevronLeft } from "lucide-react";

const sections = [
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Production", href: "/production" },
  { label: "Clients", href: "/clients" },
  { label: "Vendors", href: "/vendors" },
  { label: "Finances", href: "/finances" },
  { label: "Tasks", href: "/tasks" },
  { label: "Calendar", href: "/calendar" },
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate?.();
    router.replace("/login");
  };

  return (
    <aside className={`${className} fixed left-0 top-0 h-screen max-h-screen w-[280px] shrink-0 flex-col overflow-y-auto bg-slate-950 text-slate-100`}>
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
            <img src="/Logo.png" alt="Threefold Supply Co." className="block w-full max-w-[210px]" />
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Threefold HQ</h1>
            <p className="mt-3 text-sm text-slate-300">Made by three, worn by all.</p>
          </div>

          <nav className="space-y-2">
            {sections.map((section) => {
              const active = pathname === section.href;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={onNavigate}
                  className={`block rounded-3xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-100 text-slate-950 shadow-md"
                      : "text-slate-300 hover:bg-white/5 hover:text-slate-50"
                  }`}
                >
                  {section.label}
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
            className="w-full rounded-3xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
