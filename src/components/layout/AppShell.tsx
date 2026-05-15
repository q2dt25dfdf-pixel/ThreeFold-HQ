"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <Sidebar />
      <button
        type="button"
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-2xl leading-none text-white shadow-lg lg:hidden"
        aria-label="Open navigation"
        onClick={() => setSidebarOpen(true)}
      >
        ☰
      </button>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="h-full w-[min(20rem,85vw)]" onClick={(event) => event.stopPropagation()}>
            <Sidebar className="flex h-full w-full" onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
      <main className="flex-1 px-4 pb-8 pt-20 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
