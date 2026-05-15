"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function Sidebar({ className = "hidden lg:flex", onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className={`${className} max-h-screen w-[280px] shrink-0 flex-col overflow-y-auto bg-slate-950 text-slate-100 lg:max-h-none lg:overflow-visible`}>
      <div className="flex h-full flex-col justify-between px-6 py-8">
        <div>
          <div className="pb-6">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-300">Threefold Supply Co.</p>
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
      </div>
    </aside>
  );
}
