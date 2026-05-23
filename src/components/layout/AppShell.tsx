"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LoadingState } from "@/components/AppState";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const isPortalPage = pathname.startsWith("/portal");
  const isPublicClientPage =
    pathname.startsWith("/quote") || pathname.startsWith("/deposit") || pathname.startsWith("/invoice");

  useEffect(() => {
    if (isLoginPage || isPublicClientPage) {
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [isLoginPage, isPublicClientPage, router]);

  if (isLoginPage) {
    return <div className="min-h-dvh bg-zinc-100">{children}</div>;
  }

  if (isPortalPage || isPublicClientPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-zinc-100">
      {/* Desktop sidebar — always rendered so layout never jumps */}
      <div className={`hidden shrink-0 transition-[width] duration-300 ease-in-out lg:block ${desktopSidebarCollapsed ? "w-0" : "w-[280px]"}`}>
        <Sidebar
          className={`flex h-screen transition-transform duration-300 ease-in-out ${desktopSidebarCollapsed ? "-translate-x-full" : "translate-x-0"}`}
          showCollapseToggle={!desktopSidebarCollapsed}
          onToggleCollapse={() => setDesktopSidebarCollapsed(true)}
        />
      </div>
      {desktopSidebarCollapsed && (
        <button
          type="button"
          className="fixed left-3 top-4 z-40 hidden h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-xl leading-none text-white shadow-lg transition hover:bg-slate-800 lg:flex"
          aria-label="Expand sidebar"
          onClick={() => setDesktopSidebarCollapsed(false)}
        >
          ☰
        </button>
      )}
      {!sidebarOpen && (
        <button
          type="button"
          className="fixed left-4 top-4 z-[50000] flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-2xl leading-none text-white shadow-lg hover:bg-slate-800 active:bg-slate-900 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setSidebarOpen(true)}
        >
          ☰
        </button>
      )}
      <div
        className={`fixed inset-0 z-[9999] h-screen bg-slate-950/60 transition-opacity duration-300 ease-[ease] lg:hidden ${sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setSidebarOpen(false)}
      >
        <div
          className="fixed left-0 top-0 z-[9999] h-screen w-[min(20rem,85vw)]"
          onClick={(event) => event.stopPropagation()}
        >
          <Sidebar
            className={`fixed left-0 top-0 z-[9999] flex h-screen max-h-screen w-[min(20rem,85vw)] transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
            onNavigate={() => setSidebarOpen(false)}
          />
        </div>
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden bg-zinc-100 px-4 pb-8 pt-20 sm:px-6 lg:px-8 lg:py-8">
        {checkingSession ? (
          <LoadingState />
        ) : (
          <div className="fade-in">{children}</div>
        )}
      </main>
    </div>
  );
}
