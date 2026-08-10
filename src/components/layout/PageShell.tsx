import type React from "react";

// Canonical HQ page chrome (Style A — the majority: crm/orders/clients/vendors/
// reports). Owns the outer wrapper, kicker/heading/subtitle, the header actions
// slot, and the space-y-6 rhythm, so pages stop re-rolling their own and drifting.
// Sits inside AppShell's <main> (which supplies the container width + padding) —
// do NOT add mx-auto / max-w / page padding here.

export function PageShell({
  kicker,
  title,
  subtitle,
  actions,
  children,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker && <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">{kicker}</p>}
          <h1 className={`${kicker ? "mt-3 " : ""}text-base font-semibold text-slate-950 md:text-3xl`}>{title}</h1>
          {subtitle && <p className="mt-2 text-xs text-slate-600 md:text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

// The canonical hero grid: first tile emphasised, then two equal (matches
// orders/clients/vendors today). Put StatTile children inside.
export function PageStats({ children }: { children: React.ReactNode }) {
  return <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">{children}</section>;
}

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "amber";
}) {
  return (
    <div className="rounded-[2rem] bg-slate-50 p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 text-4xl font-bold tracking-tight md:text-5xl ${tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

// The standardized primary/secondary header action (the most common existing
// treatment: rounded-3xl bg-slate-900 px-5 py-3 …). Pages pass their own onClick.
export function PageActionButton({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  const base = "min-h-11 rounded-3xl px-5 py-3 text-xs font-semibold transition md:text-sm";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return <button className={`${base} ${styles} ${className}`.trim()} {...props} />;
}
