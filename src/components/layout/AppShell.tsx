"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-zinc-100">
      <Sidebar />
      <button
        type="button"
        className="fixed left-4 top-4 z-[99999] flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-2xl leading-none text-white shadow-lg lg:hidden"
        aria-label="Open navigation"
        onClick={() => setSidebarOpen(true)}
      >
        ☰
      </button>
      {sidebarOpen && (
        <div className="fixed inset-0 z-[9999] h-screen bg-slate-950/60 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div
            className="fixed left-0 top-0 z-[9999] h-screen w-[min(20rem,85vw)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Sidebar className="fixed left-0 top-0 z-[9999] flex h-screen max-h-screen w-[min(20rem,85vw)]" onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
      <main className="flex-1 bg-zinc-100 px-4 pb-8 pt-20 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
