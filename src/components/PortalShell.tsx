"use client";

import { PORTAL_STYLES } from "@/lib/portalStyles";

export default function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{PORTAL_STYLES}</style>
      <div
        style={{
          backgroundColor: "#f7f7f5",
          minHeight: "100vh",
          fontFamily: '"Inter","Helvetica Neue",Arial,sans-serif',
          color: "#181818",
        }}
      >
        <div className="portal-outer">{children}</div>
      </div>
    </>
  );
}
