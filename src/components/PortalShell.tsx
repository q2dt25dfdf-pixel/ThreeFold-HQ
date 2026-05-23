"use client";

import { PORTAL_STYLES } from "@/lib/portalStyles";

export default function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{PORTAL_STYLES}</style>
      <div
        style={{
          backgroundColor: "#F7F3EC",
          minHeight: "100vh",
          fontFamily: '"Inter","Helvetica Neue",Arial,sans-serif',
          color: "#0a0a0a",
        }}
      >
        <div className="portal-outer">{children}</div>
      </div>
    </>
  );
}
