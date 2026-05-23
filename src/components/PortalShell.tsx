"use client";

import { PORTAL_STYLES } from "@/lib/portalStyles";

export default function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{PORTAL_STYLES}</style>
      <div
        style={{
          backgroundColor: "#1a1815",
          minHeight: "100vh",
          fontFamily: '"Inter","Helvetica Neue",Arial,sans-serif',
          color: "#f5f1e8",
        }}
      >
        <div className="portal-outer">{children}</div>
      </div>
    </>
  );
}
