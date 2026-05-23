"use client";

import Image from "next/image";

type DashboardHeroProps = {
  todayLabel: string;
};

export default function DashboardHero({ todayLabel }: DashboardHeroProps) {
  return (
    <section
      className="relative -mx-4 -mt-20 min-h-[520px] overflow-hidden rounded-none border border-slate-800/80 bg-[#020817] px-5 pb-8 pt-24 text-white shadow-[0_30px_90px_rgba(2,8,23,0.34)] sm:-mx-6 md:mx-0 md:mt-0 md:min-h-[520px] md:rounded-[2.25rem] md:px-12 md:py-14"
      aria-label="Threefold operations dashboard hero"
    >
      <Image
        src="/bay-area-hero-bg.png"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="(min-width: 1024px) 1200px, 100vw"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom md:object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,8,23,0.96)_0%,rgba(2,8,23,0.78)_27%,rgba(2,8,23,0.28)_52%,rgba(2,8,23,0.02)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_38%,rgba(37,99,235,0.18),transparent_30%),linear-gradient(180deg,rgba(2,8,23,0.03)_0%,rgba(2,8,23,0.18)_100%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />

      <div className="relative z-10 flex min-h-[388px] max-w-xl flex-col justify-center md:min-h-[392px]">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-300">Operations HQ</p>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/80">{todayLabel}</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-[-0.07em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] sm:text-6xl md:text-7xl">
          Today at Threefold
        </h1>
        <p className="mt-5 text-lg font-semibold tracking-[-0.02em] text-blue-300 drop-shadow-[0_3px_18px_rgba(0,0,0,0.45)] md:text-2xl">
          Made by three. Worn by all.
        </p>
        <div className="mt-7 h-px max-w-sm bg-gradient-to-r from-blue-300/45 to-transparent" />
        <p className="mt-7 max-w-sm text-2xl font-medium leading-tight tracking-[-0.04em] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.45)] md:text-3xl">
          Built in the Bay.<br />
          Delivered everywhere.
        </p>
      </div>
    </section>
  );
}
