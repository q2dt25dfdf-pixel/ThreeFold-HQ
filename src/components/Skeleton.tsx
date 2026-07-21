// Lightweight skeleton loaders shaped like HQ's real pages, so loading looks like the page
// filling in rather than a lone spinner (less pop / layout shift when real data swaps in).
// Pure divs + animate-pulse. No data, no logic. Match the app's rounding/spacing so each
// skeleton occupies roughly the same footprint as the content it stands in for.

// Base shimmer block. Pass a className to size/shape it.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/60 ${className}`} aria-hidden="true" />;
}

// Page header placeholder: eyebrow + title + subtitle (matches the eyebrow/h1/sub pattern).
function SkeletonHeader() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-56 max-w-full md:h-9" />
      <Skeleton className="h-3 w-72 max-w-full" />
    </div>
  );
}

// The soft-light hero row (CRM unified box / the 3-stat rows): one rounded-[2rem] block at
// the right height. Same footprint whether the real hero is one box or three stat cards.
export function SkeletonHeroStats() {
  return <Skeleton className="h-24 w-full rounded-[2rem] md:h-28" />;
}

// A board/list card placeholder (rounded-[1.5rem], matches the compact lead/order card shape).
export function SkeletonCard() {
  return (
    <div className="rounded-[1.5rem] bg-white p-3.5 shadow-sm ring-1 ring-slate-100">
      <Skeleton className="h-4 w-2/3" />
      <div className="mt-2 flex gap-1.5">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-3 w-1/2" />
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// A board column: header bar + a couple of cards (matches the CRM stage column).
export function SkeletonColumn() {
  return (
    <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm md:p-4 lg:w-[250px] lg:shrink-0">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
      <div className="mt-4 space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

// A table/list row placeholder (finances/clients/vendors lists).
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

// ── Page-shaped skeletons (each mirrors that page's real layout + root spacing) ──────────

// Small helpers to keep the compositions terse.
const cards = (n: number) => Array.from({ length: n }, (_, i) => <SkeletonCard key={i} />);
const rows = (n: number) => Array.from({ length: n }, (_, i) => <SkeletonRow key={i} />);
const columns = (n: number) => Array.from({ length: n }, (_, i) => <SkeletonColumn key={i} />);

export function CrmSkeleton() {
  return (
    <div className="min-h-screen min-w-0 space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <SkeletonHeroStats />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">{columns(4)}</div>
    </div>
  );
}

export function OrdersSkeleton() {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <SkeletonHeroStats />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards(6)}</div>
    </div>
  );
}

export function ClientsSkeleton() {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <SkeletonHeroStats />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards(6)}</div>
    </div>
  );
}

export function FinancesSkeleton() {
  return (
    <div className="space-y-7 text-sm md:text-base">
      <SkeletonHeader />
      <SkeletonHeroStats />
      <div className="space-y-3">{rows(5)}</div>
    </div>
  );
}

export function TasksSkeleton() {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <Skeleton className="h-28 w-full rounded-[2rem]" />
      <div className="grid gap-5 xl:grid-cols-3">{cards(6)}</div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <Skeleton className="h-[60vh] w-full rounded-[2rem]" />
    </div>
  );
}

export function NotesSkeleton() {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards(6)}</div>
    </div>
  );
}

export function VendorsSkeleton() {
  return (
    <div className="space-y-6 text-sm md:text-base">
      <SkeletonHeader />
      <SkeletonHeroStats />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards(6)}</div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <SkeletonHeader />
      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards(6)}</div>
    </div>
  );
}
